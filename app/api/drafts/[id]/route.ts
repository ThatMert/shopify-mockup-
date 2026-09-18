import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { toDraftDTO } from '@/lib/dto';
import { cancelDraft } from '@/lib/comfy/queue';
import { draftUpdateSchema, prepareVariants } from '@/lib/product/variants';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** Taslagin tam durumu; UI bunu polling ile okuyup ilerlemeyi gosterir. */
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const draft = await prisma.draft.findUnique({
    where: { id },
    include: {
      variants: { orderBy: { position: 'asc' } },
      jobs: { orderBy: { createdAt: 'asc' } },
      assets: { orderBy: { position: 'asc' } },
    },
  });
  if (!draft) return NextResponse.json({ error: 'Taslak bulunamadı' }, { status: 404 });
  return NextResponse.json({ draft: toDraftDTO(draft) });
}

/** Urun bilgilerini ve varyasyonlari gunceller. */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const body = draftUpdateSchema.parse(await req.json());

    const current = await prisma.draft.findUnique({
      where: { id },
      include: { jobs: { select: { materialId: true }, take: 1 } },
    });
    if (!current) return NextResponse.json({ error: 'Taslak bulunamadı' }, { status: 404 });

    const title = body.title ?? current.title;

    // Varyasyonlar gonderildiyse tamamen degistirilir (UI tabloyu butun olarak yollar).
    if (body.variants) {
      const prepared = prepareVariants(body.variants, {
        title,
        materialId: current.materialId ?? current.jobs[0]?.materialId ?? 'gen',
      });
      await prisma.$transaction([
        prisma.variant.deleteMany({ where: { draftId: id } }),
        prisma.variant.createMany({
          data: prepared.map((v) => ({ ...v, draftId: id })),
        }),
      ]);
    }

    const draft = await prisma.draft.update({
      where: { id },
      data: {
        title,
        handle: body.handle ?? current.handle,
        description: body.description ?? current.description,
        collection: body.collection ?? current.collection,
        tags: body.tags ?? current.tags,
        vendor: body.vendor ?? current.vendor,
        productType: body.productType ?? current.productType,
        optionName: body.optionName ?? current.optionName,
        approved: body.approved ?? current.approved,
      },
      include: { variants: { orderBy: { position: 'asc' } } },
    });

    return NextResponse.json({ draft });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}

/** Taslagi (ve bagli is/gorsel kayitlarini) siler. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await cancelDraft(id);
  await prisma.draft.delete({ where: { id } }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
