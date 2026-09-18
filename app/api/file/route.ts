import path from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import sharp from 'sharp';
import { normalizeKey, storage } from '@/lib/storage';

export const dynamic = 'force-dynamic';

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

/** Onizleme genislikleri; rastgele degerlerle sunucuya yuk bindirilmesin. */
const ALLOWED_WIDTHS = [160, 320, 480, 640, 960, 1280, 1600, 2048];

/**
 * storage/ altindaki gorselleri tarayiciya servis eder.
 *
 * `w` verilirse gorsel o genislige kucultulup JPEG olarak dondurulur. Izgaralar
 * ve kart onizlemeleri bunu kullanmali: 3000 px'lik orijinaller hem yavas
 * yukleniyor hem de Netlify'in 6 MB'lik yanit sinirini asabiliyor.
 */
export async function GET(req: NextRequest) {
  const rel = req.nextUrl.searchParams.get('path');
  if (!rel) return NextResponse.json({ error: 'path parametresi gerekli' }, { status: 400 });

  let key: string;
  try {
    key = normalizeKey(rel);
  } catch {
    return NextResponse.json({ error: 'Geçersiz yol' }, { status: 403 });
  }

  const type = MIME[path.extname(key).toLowerCase()];
  if (!type) return NextResponse.json({ error: 'Desteklenmeyen dosya türü' }, { status: 415 });

  const file = await storage.read(key);
  if (!file) return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 404 });

  const headers = {
    // URL'ler dosyanin mtime'ini (v=) tasidigi icin icerik degisince adres de degisir.
    'Cache-Control': 'private, max-age=31536000, immutable',
  };

  const requested = Number(req.nextUrl.searchParams.get('w'));
  if (requested > 0) {
    const width = ALLOWED_WIDTHS.find((w) => w >= requested) ?? ALLOWED_WIDTHS.at(-1)!;
    const resized = await sharp(file.data)
      .resize({ width, withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    return new NextResponse(new Uint8Array(resized), {
      headers: { ...headers, 'Content-Type': 'image/jpeg' },
    });
  }

  return new NextResponse(new Uint8Array(file.data), {
    headers: { ...headers, 'Content-Type': type },
  });
}
