/**
 * Basit sifre korumasi (tek kullanici).
 *
 * Uygulama internete acildiginda herkes taslaklari gorup magazaya urun
 * gonderebilir, Shopify ayarlarini degistirebilirdi. APP_PASSWORD tanimliysa
 * tum sayfalar ve API'ler girise baglanir.
 *
 * Oturum cerezi sifrenin kendisini degil, HMAC imzasini tasir; sifre
 * degistirilince eski oturumlar otomatik gecersiz olur. Edge (middleware) ve
 * Node ortamlarinin ikisinde de calissin diye yalnizca Web Crypto kullanilir.
 */

export const AUTH_COOKIE = 'mockup_auth';
export const AUTH_MAX_AGE = 60 * 60 * 24 * 30; // 30 gun

/** Netlify Edge'de Netlify.env, Node'da process.env. */
export function readEnv(name: string): string | undefined {
  const netlify = (globalThis as { Netlify?: { env?: { get(k: string): string | undefined } } })
    .Netlify;
  return netlify?.env?.get(name) ?? process.env[name] ?? undefined;
}

export function authConfig(): { password: string | null; secret: string; required: boolean } {
  const password = readEnv('APP_PASSWORD')?.trim() || null;
  const secret = readEnv('APP_SECRET')?.trim() || password || '';
  // DEPLOY_TARGET derleme aninda next.config `env` ile koda gomulur (literal
  // erisim gerekli); sifre ve anahtar ise gomulmez, calisma aninda okunur.
  const isCloud = process.env.DEPLOY_TARGET === 'cloud';
  return { password, secret, required: !!password || isCloud };
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Oturum cerezinin olmasi gereken degeri. */
export async function expectedToken(password: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`${secret}::${password}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('mockup-auth-v1'));
  return toHex(sig);
}

/** Zamanlamaya dayali karsilastirma saldirisina karsi sabit sureli esitlik. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
