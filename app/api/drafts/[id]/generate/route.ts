import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { enqueue, cancelDraft } from '@/lib/comfy/queue';
import { resolveJobSpec } from '@/lib/registry/materials';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  /** Kullanicinin sectigi (materyal, aci) ciftleri. */
  selections: z
    .array(
      z.object({
        materialId: z.string().min(1),
        templateId: z.string().min(1),
        /** Ayni acidan birden fazla varyant istenirse. */
        count: z.number().int().min(1).max(4).default(1),
        /** Kullanici prompt'u elle ezmek isterse. */
        prompt: z.string().optional(),
        seed: z.number().int().nonnegative().optional(),
      }),
    )
    .min(1, 'En az bir materyal/açı seçmelisiniz'),
});

/** Secilen her (materyal x aci x adet) icin bir is olusturur ve kuyruga atar. */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const { selections } = bodySchema.parse(await req.json());

    const draft = await prisma.draft.findUnique({ where: { id } });
    if (!draft) return NextResponse.json({ error: 'Taslak bulunamadı' }, { status: 404 });
    if (!draft.designPath) {
      return NextResponse.json({ error: 'Bu taslakta işlenmiş tasarım yok' }, { status: 400 });
    }

    const jobIds: string[] = [];

    for (const sel of selections) {
      // Secim gecerli mi ve sablon gorseli diskte var mi? Kuyruga atmadan once dogrula.
      const spec = await resolveJobSpec(sel.materialId, sel.templateId);

      for (let i = 0; i < sel.count; i++) {
        const job = await prisma.mockupJob.create({
          data: {
            draftId: id,
            materialId: sel.materialId,
            templateId: sel.templateId,
            workflow: spec.workflow,
            prompt: sel.prompt?.trim() || spec.prompt,
            // Ayni acidan birden fazla istenirse her biri farkli seed alsin.
            seed: String(sel.seed != null ? sel.seed + i : Math.floor(Math.random() * 2 ** 31)),
            width: spec.width,
            height: spec.height,
            steps: spec.steps,
            cfg: spec.cfg,
          },
        });
        jobIds.push(job.id);
      }
    }

    await prisma.draft.update({ where: { id }, data: { status: 'generating', error: null } });
    enqueue(jobIds);

    return NextResponse.json({ jobIds, queued: jobIds.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}

/** Bu taslagin bekleyen/calisan tum islerini iptal eder. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await cancelDraft(id);
  return NextResponse.json({ ok: true });
}
