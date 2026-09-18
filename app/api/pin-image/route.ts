import { NextResponse, type NextRequest } from 'next/server';
import { UA } from '@/lib/source/pinterest';

export const dynamic = 'force-dynamic';

/** Yalnizca Pinterest'in kendi gorsel alan adlari proxy'lenir. */
const ALLOWED_HOSTS = /(^|\.)pinimg\.com$/i;

/**
 * Pin onizleme gorseli proxy'si.
 *
 * Tarayici i.pinimg.com'a dogrudan istek attiginda gorsel bazen bos donuyor
 * (referrer/hotlink kisiti veya ucuncu taraf gorsel engeli) ve grid'deki
 * kartlar sifir yukseklige cokuyor. Sunucu tarafindan ayni istek dogru
 * User-Agent ve Referer ile calistigi icin gorsel buradan gecirilir.
 */
export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get('url');
  if (!target) return NextResponse.json({ error: 'url parametresi gerekli' }, { status: 400 });

  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return NextResponse.json({ error: 'Geçersiz url' }, { status: 400 });
  }

  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.test(url.hostname)) {
    return NextResponse.json({ error: 'Bu adres proxy edilemez' }, { status: 400 });
  }

  const upstream = await fetch(url.toString(), {
    headers: { 'User-Agent': UA, Referer: 'https://www.pinterest.com/' },
  });
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `Görsel alınamadı (HTTP ${upstream.status})` },
      { status: 502 },
    );
  }

  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'image/jpeg',
      // Onizlemeler degismez; tarayici cache'lesin.
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  });
}
