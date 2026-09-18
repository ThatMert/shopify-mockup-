import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { storage } from '@/lib/storage';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  selected: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
});

/** Bir mockup'i Shopify'a gonderilecekler listesine alir/cikarir veya sirasini degistirir. */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const body = patchSchema.parse(await req.json());
    const asset = await prisma.asset.update({ where: { id }, data: body });
    return NextResponse.json({ asset });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}

/** Begenilmeyen bir mockup'i hem DB'den hem diskten siler. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const asset = await prisma.asset.findUnique({ where: { id } });
  if (!asset) return NextResponse.json({ error: 'Görsel bulunamadı' }, { status: 404 });

  // Kaynak ve tasarim dosyalari taslagin temeli; sadece mockup'lar silinebilir.
  if (asset.kind !== 'mockup') {
    return NextResponse.json({ error: 'Sadece mockup görselleri silinebilir' }, { status: 400 });
  }

  await prisma.asset.delete({ where: { id } });
  await storage.delete(asset.path).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
