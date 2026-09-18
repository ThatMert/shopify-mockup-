import path from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import sharp from 'sharp';
import { deletePlacement } from '@/lib/mockup/store';
import { invalidateMaterials, loadMaterial } from '@/lib/registry/materials';
import { storage } from '@/lib/storage';

export const dynamic = 'force-dynamic';

const SAFE_NAME = /^[a-zA-Z0-9._-]+$/;

/**
 * Sablon gorsellerinin uzun kenar siniri. Kompozisyon icin fazlasiyla yeterli;
 * daha buyuk dosyalar hem Blobs'ta yer kapliyor hem de her mockup'ta okunuyor.
 */
const TEMPLATE_MAX_SIZE = 3000;

/** Materyali dogrular ve sablon klasorunun depolama anahtarini dondurur. */
async function materialDir(materialId: string): Promise<string> {
  const material = await loadMaterial(materialId);
  if (!material) throw new Error(`Materyal bulunamadı: ${materialId}`);
  return `storage/templates/${material.id}`;
}

/**
 * Bir materyalin sablon klasorune mockup gorseli yukler.
 *
 * `filename` JSON'da tanimli bir sablonun dosya adiyla eslesirse o aci
 * doldurulur/degistirilir; farkli bir ad verilirse otomatik kesfedilen
 * yeni bir aci olur. Ayni ada tekrar yukleme = degistirme.
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const materialId = String(form.get('materialId') ?? '');
    const file = form.get('file');
    const requestedName = String(form.get('filename') ?? '');

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: 'Dosya gerekli' }, { status: 400 });
    }

    const dir = await materialDir(materialId);

    const base = path.basename(requestedName || file.name);
    if (!SAFE_NAME.test(base)) {
      return NextResponse.json(
        { error: 'Dosya adı sadece harf, rakam, nokta, tire ve alt çizgi içerebilir' },
        { status: 400 },
      );
    }

    // Her sablon PNG olarak normalize edilir; uzanti farkliysa duzeltilir.
    const outName = `${path.basename(base, path.extname(base))}.png`;
    const key = `${dir}/${outName}`;

    const { data: png, info } = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate() // EXIF yonunu uygula
      .resize({
        width: TEMPLATE_MAX_SIZE,
        height: TEMPLATE_MAX_SIZE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png({ compressionLevel: 8 })
      .toBuffer({ resolveWithObject: true });

    await storage.write(key, png);
    invalidateMaterials();

    return NextResponse.json({
      path: key,
      filename: outName,
      width: info.width,
      height: info.height,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}

/**
 * Bir sablon gorselini siler.
 * JSON'da tanimli bir aci ise tanim kalir, sadece gorseli bosalir
 * ("görsel eksik" durumuna doner); otomatik kesfedilen aci ise tamamen kaybolur.
 */
export async function DELETE(req: NextRequest) {
  try {
    const materialId = req.nextUrl.searchParams.get('materialId') ?? '';
    const filename = req.nextUrl.searchParams.get('filename') ?? '';

    const base = path.basename(filename);
    if (!base || !SAFE_NAME.test(base)) {
      return NextResponse.json({ error: 'Geçersiz dosya adı' }, { status: 400 });
    }

    const dir = await materialDir(materialId);
    const key = `${dir}/${base}`;
    if (!(await storage.stat(key)).exists) {
      return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 404 });
    }

    await storage.delete(key);
    // Gorsel gidince yanindaki yerlesim dosyasi da anlamsiz kalir.
    await deletePlacement(materialId, base);
    invalidateMaterials();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
