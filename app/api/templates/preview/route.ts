import path from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import sharp from 'sharp';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { compositeMockup } from '@/lib/mockup/composite';
import { placementSchema } from '@/lib/mockup/placement';
import { ensureSampleDesign } from '@/lib/mockup/sample';
import { loadMaterial } from '@/lib/registry/materials';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  materialId: z.string().min(1),
  filename: z.string().min(1),
  placement: placementSchema,
  /** Verilirse bu taslagin gercek tasarimi kullanilir; yoksa ornek desen. */
  draftId: z.string().optional(),
  /** Onizleme icin uzun kenar; editorde kucuk tutulur ki hizli olsun. */
  maxSize: z.number().int().min(256).max(2048).default(768),
});

/**
 * Yerlesim editoru icin canli onizleme: verilen koseler ve harman ayarlariyla
 * kompozisyonu yapip PNG dondurur. Diske hicbir sey yazmaz.
 */
export async function POST(req: NextRequest) {
  try {
    const body = bodySchema.parse(await req.json());

    const material = await loadMaterial(body.materialId);
    if (!material) {
      return NextResponse.json(
        { error: `Materyal bulunamadı: ${body.materialId}` },
        { status: 404 },
      );
    }

    const filename = path.basename(body.filename);
    const template = material.templates.find((t) => path.basename(t.file) === filename);
    if (!template?.exists) {
      return NextResponse.json({ error: 'Şablon görseli bulunamadı' }, { status: 404 });
    }

    // Gercek tasarim varsa onu kullan; boylece kullanici kendi isini gorur.
    let designPath: string | null = null;
    if (body.draftId) {
      const draft = await prisma.draft.findUnique({
        where: { id: body.draftId },
        select: { designPath: true },
      });
      designPath = draft?.designPath ?? null;
    }
    designPath ??= await ensureSampleDesign();

    const result = await compositeMockup(template.path, designPath, body.placement, {
      // Onizlemede hiz onemli; kalite ayarini uretimde yukseltiyoruz.
      supersample: 1,
    });

    const png = await sharp(result.buffer)
      .resize({ width: body.maxSize, height: body.maxSize, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 3 })
      .toBuffer();

    return new NextResponse(new Uint8Array(png), {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
