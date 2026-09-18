import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { startBatch } from '@/lib/batch/orchestrator';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  batchId: z.string().min(1),
  /** Pin kayit id'leri (Pin.id, Pinterest pin id degil). */
  pinIds: z.array(z.string().min(1)).min(1, 'En az bir pin seçmelisiniz'),
  materials: z
    .array(
      z.object({
        materialId: z.string().min(1),
        templateIds: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(1, 'En az bir materyal seçmelisiniz'),
});

/** Adim 2-3 — secilen pin x materyal x aci kombinasyonlari icin uretimi baslatir. */
export async function POST(req: NextRequest) {
  try {
    const body = bodySchema.parse(await req.json());
    const result = await startBatch(body);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}

/** Son batch'ler (ana sayfa listesi). */
export async function GET() {
  const batches = await prisma.batch.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 20,
    include: { _count: { select: { pins: true, drafts: true } } },
  });
  return NextResponse.json({ batches });
}
