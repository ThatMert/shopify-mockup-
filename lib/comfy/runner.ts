import 'server-only';
import path from 'node:path';
import sharp from 'sharp';
import { prisma } from '@/lib/db';
import { readRequired } from '@/lib/storage';
import { saveMockup } from '@/lib/image/pipeline';
import { compositeMockup } from '@/lib/mockup/composite';
import { resolveJobSpec, type JobSpec } from '@/lib/registry/materials';
import { downloadImage, runWorkflow, uploadImage } from './client';
import { applyPlaceholders, assertNoPlaceholders, loadWorkflow, removeNode } from './graph';
import { assertModelsInstalled } from './validate';
import { nearestKontextResolution, referenceSize } from './resolution';

/** boogu_mockup_edit.json icinde tasarim gorselini yukleyen LoadImage node'u. */
const DESIGN_NODE_ID = '5';

/** Tek bir MockupJob'i bastan sona calistirir ve ciktilarini Asset olarak kaydeder. */
export async function runJob(jobId: string, signal?: AbortSignal): Promise<void> {
  const job = await prisma.mockupJob.findUnique({
    where: { id: jobId },
    include: { draft: true },
  });
  if (!job) throw new Error(`İş bulunamadı: ${jobId}`);

  await prisma.mockupJob.update({
    where: { id: jobId },
    data: { status: 'running', progress: 0, error: null },
  });

  try {
    const spec = await resolveJobSpec(job.materialId, job.templateId);

    // Yerlesimi tanimli aciler geometriyi ComfyUI'ye hic tasimaz: perspektif
    // kompozisyon hem ~1000x daha hizli hem de tasarimi piksel piksel korur.
    // "composite+harmonize" ayni kompozisyonu ustune dusuk denoise bir FLUX
    // rotus pasindan gecirir.
    if (spec.template.resolvedMethod.startsWith('composite')) {
      await runComposite(job.id, job.draftId, job.draft.designPath, spec, signal);
      return;
    }

    // 1) Referans gorselleri ComfyUI'nin input klasorune yukle.
    const templateName = await uploadImage(
      await readRequired(spec.template.path),
      `tpl-${job.materialId}-${job.templateId}${path.extname(spec.template.path) || '.png'}`,
      { subfolder: 'shopify-ai' },
    );

    let designName: string | null = null;
    if (job.draft.designPath) {
      designName = await uploadImage(
        await readRequired(job.draft.designPath),
        `design-${job.draftId}.png`,
        { subfolder: 'shopify-ai' },
      );
    }

    // 2) Olculeri hesapla.
    //
    // Kontext yalnizca sabit bir cozunurluk listesini destekliyor. ComfyUI'nin
    // FluxKontextImageScale node'u bu listeye ORTADAN KIRPARAK oturtuyor ve
    // sablonun kenarlari / tasarimin bir kismi kayboluyor. Bu yuzden olculeri
    // burada hesaplayip kirpmasiz ImageScale ile uyguluyoruz; olusan kucuk oran
    // sapmasi ciktinin sonunda orijinal olculere geri olceklenmesiyle giderilir.
    const templateMeta = await sharp(await readRequired(spec.template.path)).metadata();
    const templateW = templateMeta.width ?? 1024;
    const templateH = templateMeta.height ?? 1024;
    const kontext = nearestKontextResolution(templateW, templateH);

    let designSize = { width: 1024, height: 1024 };
    if (job.draft.designPath) {
      const designMeta = await sharp(await readRequired(job.draft.designPath)).metadata();
      designSize = referenceSize(designMeta.width ?? 1024, designMeta.height ?? 1024);
    }

    // 3) Workflow'u yukle ve parametreleri enjekte et.
    let graph = await loadWorkflow(spec.workflow);
    graph = applyPlaceholders(graph, {
      '%%IMAGE_1%%': templateName,
      '%%IMAGE_2%%': designName ?? '',
      '%%PROMPT%%': job.prompt || spec.prompt,
      '%%NEGATIVE_PROMPT%%': spec.negativePrompt,
      '%%WIDTH%%': job.width,
      '%%HEIGHT%%': job.height,
      '%%TEMPLATE_W%%': kontext.width,
      '%%TEMPLATE_H%%': kontext.height,
      '%%DESIGN_W%%': designSize.width,
      '%%DESIGN_H%%': designSize.height,
      '%%SEED%%': Number(job.seed),
      '%%STEPS%%': job.steps,
      '%%CFG%%': job.cfg,
      // Flux Kontext CFG yerine FluxGuidance kullanir; ayni ayardan beslenir.
      '%%GUIDANCE%%': job.cfg,
      '%%SAMPLER%%': spec.sampler,
      '%%SCHEDULER%%': spec.scheduler,
      '%%SHIFT%%': spec.shift,
      '%%FILENAME_PREFIX%%': `shopify-ai/${job.draftId}/${job.materialId}-${job.templateId}`,
    });

    // Tasarim yoksa ikinci referans gorseli grafiktan tamamen cikar.
    if (!designName) graph = removeNode(graph, DESIGN_NODE_ID);
    assertNoPlaceholders(graph);
    // Model dosyalari eksikse kuyruga atmadan once anlasilir hata ver.
    await assertModelsInstalled(graph);

    // 4) Calistir; ilerlemeyi DB'ye yaz (UI polling ile okur).
    let lastWrite = 0;
    const { promptId, images } = await runWorkflow(
      graph,
      {
        onProgress: (percent) => {
          // Her tick'te DB'ye yazmamak icin saniyede birden fazla guncelleme yapma.
          const now = Date.now();
          if (now - lastWrite < 1000 && percent < 100) return;
          lastWrite = now;
          void prisma.mockupJob
            .update({ where: { id: jobId }, data: { progress: percent } })
            .catch(() => undefined);
        },
      },
      signal,
    );

    if (images.length === 0) throw new Error('ComfyUI çıktı üretmedi');

    // 5) Ciktilari indirip storage/mockups altina yaz.
    const existing = await prisma.asset.count({ where: { draftId: job.draftId } });
    for (const [i, ref] of images.entries()) {
      const raw = await downloadImage(ref);

      // Kontext cozunurluk listesine oturmak icin uygulanan oran sapmasini
      // geri al: cikti sablonun orijinal olculerine dondurulur.
      const buffer =
        kontext.width === templateW && kontext.height === templateH
          ? raw
          : await sharp(raw).resize(templateW, templateH, { fit: 'fill' }).png().toBuffer();

      const saved = await saveMockup(
        buffer,
        `${job.draftId}-${job.materialId}-${job.templateId}-${i}.png`,
      );
      await prisma.asset.create({
        data: {
          draftId: job.draftId,
          jobId: job.id,
          path: saved.path,
          kind: 'mockup',
          width: saved.width,
          height: saved.height,
          position: existing + i,
        },
      });
    }

    await prisma.mockupJob.update({
      where: { id: jobId },
      data: { status: 'done', progress: 100, promptId },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.mockupJob.update({
      where: { id: jobId },
      data: { status: message.includes('iptal') ? 'cancelled' : 'failed', error: message },
    });
    throw err;
  }
}


/**
 * Kompozisyon yolu: tasarimi sablondaki yuzeye perspektifle oturtur.
 * ComfyUI'ye yalnizca (istenirse) harmonizasyon pasi icin dokunur;
 * kompozisyonun kendisi tipik olarak birkac yuz milisaniye surer.
 */
async function runComposite(
  jobId: string,
  draftId: string,
  designPath: string | null,
  spec: JobSpec,
  signal?: AbortSignal,
): Promise<void> {
  if (!designPath) throw new Error('Kompozisyon için işlenmiş tasarım gerekli');
  if (!spec.template.placement) {
    throw new Error(`Yerleşim tanımlı değil: ${spec.material.id}/${spec.template.id}`);
  }

  const result = await compositeMockup(spec.template.path, designPath, spec.template.placement, {
    // Ahsap ve canvas'ta yansima (screen) katkisi kapatilir.
    reflective: spec.material.reflective,
  });

  let buffer = result.buffer;
  let warning: string | null = null;

  if (spec.template.resolvedMethod === 'composite+harmonize') {
    try {
      buffer = await harmonize(buffer, result.width, result.height, jobId, draftId, spec, signal);
    } catch (err) {
      // Rotus pasi bir iyilestirme; basarisiz olursa kompozisyon ciktisi korunur
      // ve neden atlandigi kullaniciya uyari olarak gosterilir.
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('iptal')) throw err;
      warning = `AI harmonizasyon pası atlandı: ${message}`;
      console.warn(`[runner] ${jobId} harmonizasyon atlandı: ${message}`);
    }
  }

  const saved = await saveMockup(
    buffer,
    `${draftId}-${spec.material.id}-${spec.template.id}-${Date.now()}.png`,
  );

  const existing = await prisma.asset.count({ where: { draftId } });
  await prisma.asset.create({
    data: {
      draftId,
      jobId,
      path: saved.path,
      kind: 'mockup',
      width: saved.width,
      height: saved.height,
      position: existing,
    },
  });

  await prisma.mockupJob.update({
    where: { id: jobId },
    data: { status: 'done', progress: 100, warning },
  });
}

/**
 * Kompozisyon ciktisini dusuk denoise bir FLUX img2img pasindan gecirir.
 *
 * Kompozisyon zaten geometrik olarak dogru; buradaki tek amac kenar/renk
 * gecislerini dogallastirmak. Bu yuzden denoise materyalin harmonize
 * ayarindan gelir ve varsayilan olarak 0.25'tir.
 */
async function harmonize(
  composite: Buffer,
  width: number,
  height: number,
  jobId: string,
  draftId: string,
  spec: JobSpec,
  signal?: AbortSignal,
): Promise<Buffer> {
  const h = spec.material.harmonize;

  const uploaded = await uploadImage(composite, `harmonize-${jobId}.png`, {
    subfolder: 'shopify-ai',
  });

  let graph = await loadWorkflow(h.workflow);
  graph = applyPlaceholders(graph, {
    '%%COMPOSITE%%': uploaded,
    '%%PROMPT%%': h.prompt,
    '%%GUIDANCE%%': h.guidance,
    '%%SEED%%': Math.floor(Math.random() * 2 ** 31),
    '%%STEPS%%': h.steps,
    '%%DENOISE%%': h.denoise,
    '%%SAMPLER%%': spec.sampler,
    '%%SCHEDULER%%': spec.scheduler,
    '%%FILENAME_PREFIX%%': `shopify-ai/${draftId}/${spec.material.id}-${spec.template.id}-harmonized`,
  });
  assertNoPlaceholders(graph);
  await assertModelsInstalled(graph);

  let lastWrite = 0;
  const { images } = await runWorkflow(
    graph,
    {
      onProgress: (percent) => {
        const now = Date.now();
        if (now - lastWrite < 1000 && percent < 100) return;
        lastWrite = now;
        void prisma.mockupJob
          .update({ where: { id: jobId }, data: { progress: percent } })
          .catch(() => undefined);
      },
    },
    signal,
  );

  if (images.length === 0) throw new Error('ComfyUI çıktı üretmedi');

  const raw = await downloadImage(images[0]);
  const meta = await sharp(raw).metadata();

  // VAE, olculeri 8'in katina yuvarlayabiliyor; kompozisyonun olcusune geri don.
  return meta.width === width && meta.height === height
    ? raw
    : sharp(raw).resize(width, height, { fit: 'fill' }).png().toBuffer();
}
