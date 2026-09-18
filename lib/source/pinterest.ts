import 'server-only';

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export interface PinResult {
  imageUrl: string;
  pageUrl: string;
  title?: string;
  description?: string;
}

/** pin.it kisa linklerini gercek pin adresine cevirir. */
async function resolveShortLink(url: string): Promise<string> {
  if (!/(^|\.)pin\.it$/.test(new URL(url).hostname)) return url;
  const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA } });
  return res.url || url;
}

/**
 * Pinterest CDN yollari boyut segmenti icerir (/236x/, /474x/, /564x/...).
 * "/originals/" en yuksek cozunurluklu dosyadir.
 */
export function upgradeToOriginal(url: string): string {
  return url.replace(/\/\d+x\d*\//, '/originals/');
}

/** HTML icindeki ilk eslesen meta etiketinin content degeri. */
export function metaContent(html: string, property: string): string | undefined {
  const before = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]*content=["']([^"']+)["']`,
    'i',
  );
  const after = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${property}["']`,
    'i',
  );
  return html.match(before)?.[1] ?? html.match(after)?.[1];
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Bir Pinterest pin URL'sinden orijinal gorsel adresini cikarir.
 * Once og:image meta etiketine bakar, bulamazsa sayfadaki gomulu JSON icinde
 * i.pinimg.com yollarini arar.
 */
export async function resolvePin(inputUrl: string): Promise<PinResult> {
  let url: string;
  try {
    url = new URL(inputUrl.trim()).toString();
  } catch {
    throw new Error('Gecersiz URL');
  }

  const host = new URL(url).hostname;
  if (!/(^|\.)(pinterest\.[a-z.]+|pin\.it)$/i.test(host)) {
    throw new Error('Bu bir Pinterest baglantisi degil');
  }

  const pageUrl = await resolveShortLink(url);

  const res = await fetch(pageUrl, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
  });
  if (!res.ok) throw new Error(`Pin sayfasi alinamadi (HTTP ${res.status})`);
  const html = await res.text();

  let imageUrl = metaContent(html, 'og:image');

  if (!imageUrl) {
    // Gomulu __PWS_DATA__ / ld+json bloklarindaki dogrudan CDN yollarina dus.
    const matches = html.match(/https:\/\/i\.pinimg\.com\/[^"'\\s]+\.(?:jpg|jpeg|png|webp)/gi);
    imageUrl = matches?.sort(
      (a, b) => Number(b.includes('originals')) - Number(a.includes('originals')),
    )[0];
  }

  if (!imageUrl) {
    throw new Error(
      'Pin gorseli bulunamadi. Pin gizli veya silinmis olabilir - gorseli manuel yukleyebilirsiniz.',
    );
  }

  return {
    imageUrl: upgradeToOriginal(decodeEntities(imageUrl)),
    pageUrl,
    title: metaContent(html, 'og:title')?.trim(),
    description: metaContent(html, 'og:description')?.trim(),
  };
}

/** Cozumlenen gorseli indirir; /originals/ 404 verirse meta URL'sine geri doner. */
export async function downloadPinImage(pin: PinResult): Promise<Buffer> {
  const candidates = [upgradeToOriginal(pin.imageUrl), pin.imageUrl].filter(
    (v, i, a) => a.indexOf(v) === i,
  );

  let lastError = 'bilinmeyen hata';
  for (const candidate of candidates) {
    const res = await fetch(candidate, { headers: { 'User-Agent': UA, Referer: pin.pageUrl } });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    lastError = `HTTP ${res.status}`;
  }
  throw new Error(`Pin gorseli indirilemedi (${lastError})`);
}
