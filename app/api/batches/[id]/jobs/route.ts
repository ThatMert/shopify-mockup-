import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { cancelDraft } from '@/lib/comfy/queue';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** Batch'teki tum bekleyen/calisan mockup islerini iptal eder. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  const drafts = await prisma.draft.findMany({
    where: { batchId: id },
    select: { id: true },
  });
  for (const draft of drafts) await cancelDraft(draft.id);

  await prisma.batch.update({ where: { id }, data: { status: 'review' } }).catch(() => undefined);
  return NextResponse.json({ ok: true, cancelledDrafts: drafts.length });
}
