import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { toBatchDTO } from '@/lib/dto';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** Batch'in tam durumu; UI bunu polling ile okuyup ilerlemeyi gosterir. */
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  const batch = await prisma.batch.findUnique({
    where: { id },
    include: {
      pins: { orderBy: { position: 'asc' } },
      drafts: {
        orderBy: { createdAt: 'asc' },
        include: {
          variants: { orderBy: { position: 'asc' } },
          jobs: { orderBy: { createdAt: 'asc' } },
          assets: { orderBy: { position: 'asc' } },
        },
      },
    },
  });
  if (!batch) return NextResponse.json({ error: 'Batch bulunamadı' }, { status: 404 });

  const dto = toBatchDTO(batch);

  // Tum isler bittiginde batch kendiliginden inceleme adimina gecer.
  const active = dto.counts.queued + dto.counts.running;
  if (batch.status === 'generating' && dto.counts.total > 0 && active === 0) {
    await prisma.batch.update({ where: { id }, data: { status: 'review' } });
    dto.status = 'review';
  }

  return NextResponse.json({ batch: dto });
}

/** Batch'i, taslaklarini ve gorsel kayitlarini siler. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await prisma.batch.delete({ where: { id } }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
