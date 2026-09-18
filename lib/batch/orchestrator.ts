import 'server-only';
import { prisma } from '@/lib/db';
import { enqueue } from '@/lib/comfy/queue';
import { prepareDesign, saveSource } from '@/lib/image/pipeline';
import {
  buildHandle,
  generateSku,
  prepareVariants,
  variantsFromSizes,
} from '@/lib/product/variants';
import { loadMaterials, resolveJobSpec } from '@/lib/registry/materials';
import type { ResolvedMaterial } from '@/lib/registry/schema';
import { downloadPinImage } from '@/lib/source/pinterest';
import { REQUEST_BUDGET_MS } from '@/lib/runtime';

/**
 * Toplu uretim orkestrasyonu.
 *
 * Bir batch icin: secilen pinlerin gorselini indirir, her (pin x materyal) icin
 * bir Draft (= bir Shopify urunu) ve secilen her aci icin bir MockupJob acar,
 * isleri mevcut seri kuyruga verir.
 */

/** Ayni anda kac pin indirilecek. Pinterest CDN'i zorlamamak icin dusuk tutuldu. */
const DOWNLOAD_CONCURRENCY = 3;

export interface MaterialSelection {
  materialId: string;
  /** Bu materyalden uretilecek acilar (sablon id'leri). */
  templateIds: string[];
}

export interface StartBatchInput {
  batchId: string;
  pinIds: string[];
  materials: MaterialSelection[];
}

export interface StartBatchResult {
  draftIds: string[];
  jobIds: string[];
  /** Gorseli indirilemeyen pinler; is acilmaz, sebebi Pin.error'a yazilir. */
  failedPins: Array<{ pinId: string; error: string }>;
  /**
   * Zaman butcesi dolduğu icin bu istekte islenemeyen pin sayisi.
   * 0'dan buyukse istemci ayni istegi tekrar gondermeli; islenmis pinler atlanir.
   */
  remainingPins: number;
}

/** Sinirli eszamanlilikla map; sirayi korur. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Pin notundan urun basligina uygun kisa bir tasarim adi cikarir.
 * Pinterest notlari cok uzun ve hashtag'li olabiliyor; ilk cumle yeterli.
 */
function designNameFromNote(note: string, fallbackIndex: number): string {
  const cleaned = note
    .replace(/#[\wçğıöşüÇĞİÖŞÜ]+/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const firstSentence = cleaned.split(/[.!?\n|•·]/)[0]?.trim() ?? '';
  const name = (firstSentence || cleaned).slice(0, 60).trim();
  return name || `Tasarım ${fallbackIndex + 1}`;
}

function applyTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => values[key] ?? match);
}

/** Materyalin metin sablonlarindan urun basligi ve aciklamasini kurar. */
function productTextFor(
  material: ResolvedMaterial,
  designName: string,
): { title: string; description: string } {
  const title = material.titleTemplate
    ? applyTemplate(material.titleTemplate, { design: designName, title: designName })
    : `${designName} ${material.productType || material.label}`.trim();

  const description = applyTemplate(material.bodyTemplate, { design: designName, title });

  return { title, description };
}

/** Batch'te daha once kullanilmis handle'lar; ayni board'da cakisma olmasin. */
async function takenHandles(batchId: string): Promise<Set<string>> {
  const rows = await prisma.draft.findMany({
    where: { handle: { not: '' } },
    select: { handle: true },
  });
  void batchId; // handle magaza genelinde tekil olmali, batch'e bagli degil
  return new Set(rows.map((r) => r.handle));
}

/**
 * Secilen pin x materyal kombinasyonlari icin taslak ve mockup islerini olusturur.
 * Gorsel indirme burada (istek icinde) yapilir; mockup uretimi kuyruga devredilir.
 */
export async function startBatch(input: StartBatchInput): Promise<StartBatchResult> {
  const batch = await prisma.batch.findUnique({ where: { id: input.batchId } });
  if (!batch) throw new Error('Batch bulunamadı');
  if (input.pinIds.length === 0) throw new Error('En az bir pin seçmelisiniz');
  if (input.materials.length === 0) throw new Error('En az bir materyal seçmelisiniz');

  const allMaterials = await loadMaterials();
  const selected = input.materials.map((sel) => {
    const material = allMaterials.find((m) => m.id === sel.materialId);
    if (!material) throw new Error(`Materyal bulunamadı: ${sel.materialId}`);
    if (sel.templateIds.length === 0) {
      throw new Error(`${material.label} için en az bir açı seçmelisiniz`);
    }
    if (material.sizes.length === 0) {
      throw new Error(
        `${material.label} için ölçü/fiyat tablosu tanımlı değil ` +
          `(config/materials/${material.id}.json → "sizes")`,
      );
    }
    // Sablon ve gorseli gercekten var mi? Indirmeye baslamadan once dogrula.
    return { material, templateIds: sel.templateIds };
  });

  for (const { material, templateIds } of selected) {
    for (const templateId of templateIds) {
      await resolveJobSpec(material.id, templateId);
    }
  }

  // --- Secim durumunu kaydet: sadece isaretlenen pinler islenir.
  await prisma.pin.updateMany({ where: { batchId: batch.id }, data: { selected: false } });
  await prisma.pin.updateMany({
    where: { batchId: batch.id, id: { in: input.pinIds } },
    data: { selected: true, error: null },
  });

  const pins = await prisma.pin.findMany({
    where: { batchId: batch.id, id: { in: input.pinIds } },
    orderBy: { position: 'asc' },
  });

  await prisma.batch.update({ where: { id: batch.id }, data: { status: 'collecting' } });

  // --- Gorselleri indir ve on isle (sinirli eszamanlilikla).
  //
  // Netlify'da bir istek en fazla 60 sn yasiyor. Buyuk board'larda indirme
  // butceyi asarsa kalan pinler bu istekte atlanir; istemci ayni istegi
  // tekrarlar ve indirilmis pinler (designPath dolu) yeniden indirilmez.
  const deadline = Date.now() + REQUEST_BUDGET_MS * 0.6;
  const failedPins: StartBatchResult['failedPins'] = [];
  let skippedForTime = 0;

  const prepared = await mapLimit(pins, DOWNLOAD_CONCURRENCY, async (pin) => {
    // Ayni pin tekrar islenirse indirmeyi atla.
    if (pin.designPath) return pin;
    if (Date.now() > deadline) {
      skippedForTime++;
      return null;
    }

    try {
      const buffer = await downloadPinImage({ imageUrl: pin.imageUrl, pageUrl: pin.pinUrl });
      const source = await saveSource(buffer, `pin-${pin.id}`);
      const design = await prepareDesign(source.path, `pin-${pin.id}`);
      return prisma.pin.update({
        where: { id: pin.id },
        data: { sourcePath: source.path, designPath: design.path, error: null },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failedPins.push({ pinId: pin.pinId, error: message });
      await prisma.pin.update({ where: { id: pin.id }, data: { error: message } });
      return null;
    }
  });

  const usable = prepared.filter((p): p is NonNullable<typeof p> => p !== null && !!p.designPath);
  if (usable.length === 0 && skippedForTime === 0) {
    await prisma.batch.update({ where: { id: batch.id }, data: { status: 'review' } });
    throw new Error('Seçilen pinlerin hiçbiri indirilemedi');
  }

  // Istek tekrarlandiginda ayni (pin x materyal) icin ikinci taslak acilmasin.
  const existingDrafts = await prisma.draft.findMany({
    where: { batchId: batch.id, pinId: { in: usable.map((p) => p.id) } },
    select: { pinId: true, materialId: true },
  });
  const alreadyCreated = new Set(existingDrafts.map((d) => `${d.pinId}|${d.materialId}`));

  // --- Her (pin x materyal) icin taslak + varyasyonlar + isler.
  const handles = await takenHandles(batch.id);
  const draftIds: string[] = [];
  const jobIds: string[] = [];

  for (const [index, pin] of usable.entries()) {
    const designName = designNameFromNote(pin.note, index);

    for (const { material, templateIds } of selected) {
      if (alreadyCreated.has(`${pin.id}|${material.id}`)) continue;
      const { title, description } = productTextFor(material, designName);
      const handle = buildHandle(title, handles);

      const draft = await prisma.draft.create({
        data: {
          batchId: batch.id,
          pinId: pin.id,
          materialId: material.id,
          status: 'generating',
          sourceType: 'pinterest',
          sourceUrl: pin.pinUrl,
          sourcePath: pin.sourcePath,
          designPath: pin.designPath,
          title,
          handle,
          description,
          tags: [...material.tags, material.shopifyTag].filter(Boolean).join(', '),
          vendor: material.vendor,
          productType: material.productType,
          optionName: material.optionName,
        },
      });
      draftIds.push(draft.id);

      // SKU'lar magaza genelinde tekil olmali: ayni materyalde iki tasarim ayni
      // basligi tasiyabildigi icin sona pinin son 4 hanesi ekleniyor.
      const suffix = pin.pinId.slice(-4);
      const variants = prepareVariants(
        variantsFromSizes(material.sizes).map((v) => ({
          ...v,
          sku: `${generateSku(title, material.id, v.size)}-${suffix}`,
        })),
        { title, materialId: material.id },
      );
      await prisma.variant.createMany({
        data: variants.map((v) => ({ ...v, draftId: draft.id })),
      });

      for (const templateId of templateIds) {
        const spec = await resolveJobSpec(material.id, templateId);
        const job = await prisma.mockupJob.create({
          data: {
            draftId: draft.id,
            materialId: material.id,
            templateId,
            workflow: spec.workflow,
            prompt: spec.prompt,
            seed: String(Math.floor(Math.random() * 2 ** 31)),
            width: spec.width,
            height: spec.height,
            steps: spec.steps,
            cfg: spec.cfg,
          },
        });
        jobIds.push(job.id);
      }
    }
  }

  await prisma.batch.update({
    where: { id: batch.id },
    data: { status: skippedForTime > 0 ? 'collecting' : 'generating' },
  });
  enqueue(jobIds);

  return { draftIds, jobIds, failedPins, remainingPins: skippedForTime };
}
