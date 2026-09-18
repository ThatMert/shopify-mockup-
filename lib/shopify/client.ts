import 'server-only';
import { getShopifySettings } from '@/lib/settings/shopify';

export interface ShopifyConfig {
  domain: string;
  apiVersion: string;
  /** Elde hazir, suresi dolmayan Admin API token'i (eski admin custom app'leri). */
  staticToken?: string;
  /** Dev Dashboard uygulamasinin kimlik bilgileri. */
  clientId?: string;
  clientSecret?: string;
}

/**
 * Kimlik dogrulama iki yoldan biriyle kurulur:
 *
 *  1. SHOPIFY_ADMIN_TOKEN — magaza admin'inde olusturulan eski "custom app"in
 *     tek seferlik gosterilen shpat_ token'i. Shopify 1 Ocak 2026'dan itibaren
 *     bu tur uygulamalarin YENISININ olusturulmasini kaldirdi; mevcut olanlar
 *     calismaya devam ediyor.
 *
 *  2. SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET — Dev Dashboard'da olusturulan
 *     uygulamanin kimlik bilgileri. Access token client credentials grant ile
 *     alinir, 24 saat gecerlidir ve burada bellekte tutulup suresi dolmadan
 *     yenilenir. Bu akis yalnizca uygulama ile magaza AYNI Shopify
 *     organizasyonundaysa calisir; izinler (scope) uygulamanin Dev Dashboard
 *     ayarlarindan gelir, token isteginde gonderilmez.
 */
export async function getShopifyConfig(): Promise<ShopifyConfig> {
  // Oncelik: ayarlar sayfasindan kaydedilenler, yoksa .env.
  const settings = await getShopifySettings();

  if (!settings?.domain) {
    throw new Error(
      'Shopify bağlantısı kurulmamış. Ayarlar sayfasından (/settings) mağazanızı ekleyin.',
    );
  }

  const staticToken = settings.authMode === 'admin_token' ? settings.adminToken : undefined;
  const clientId = settings.authMode === 'client_credentials' ? settings.clientId : undefined;
  const clientSecret =
    settings.authMode === 'client_credentials' ? settings.clientSecret : undefined;

  // shpss_ bir client secret'tir; X-Shopify-Access-Token olarak gonderilirse
  // Shopify "Invalid API key or access token" (401) doner. Bu yaygin
  // karisikligi istek gitmeden once ve acikca bildir.
  if (staticToken?.startsWith('shpss_')) {
    throw new Error(
      'Admin API token alanında bir client secret (shpss_…) var; bu değer doğrudan token olarak ' +
        'kullanılamaz. Ayarlar sayfasında "Client ID + Secret" seçeneğini kullanın.',
    );
  }

  if (!staticToken && !(clientId && clientSecret)) {
    throw new Error(
      'Shopify kimlik bilgileri eksik ya da okunamadı. Ayarlar sayfasından (/settings) ' +
        'Client ID + Client Secret veya Admin API token girin.',
    );
  }

  return {
    domain: settings.domain,
    apiVersion: settings.apiVersion,
    staticToken: staticToken || undefined,
    clientId: clientId || undefined,
    clientSecret: clientSecret || undefined,
  };
}

interface CachedToken {
  /** Token'in hangi magaza + uygulama icin alindigi; ayar degisince gecersiz olur. */
  owner: string;
  token: string;
  /** Epoch ms cinsinden gecerlilik sonu. */
  expiresAt: number;
  /** Token'a islenmis izinler; uygulamanin YAYINLANMIS surumunden gelir. */
  scopes: string[];
}

/** Bu uygulamanin calismasi icin gereken izinler. */
export const REQUIRED_SCOPES = [
  'read_products',
  'write_products',
  'read_files',
  'write_files',
] as const;

// Next.js dev modunda modul yeniden yuklendiginde token kaybolmasin (ve her
// istekte yeni token istenmesin) diye durum globalThis uzerinde tutulur.
const globalForToken = globalThis as unknown as { __shopifyToken?: CachedToken };

/** Suresi dolmadan 60 sn once yenile. */
const REFRESH_MARGIN_MS = 60_000;

/**
 * Client credentials grant: client id/secret'i 24 saatlik access token'a cevirir.
 * POST https://{shop}.myshopify.com/admin/oauth/access_token
 */
async function fetchClientCredentialsToken(cfg: ShopifyConfig): Promise<CachedToken> {
  const res = await fetch(`https://${cfg.domain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: cfg.clientId as string,
      client_secret: cfg.clientSecret as string,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `Shopify access token alınamadı (HTTP ${res.status}): ${body.slice(0, 300)} — ` +
        'Client ID/secret doğru mu ve uygulama ile mağaza aynı Shopify organizasyonunda mı?',
    );
  }

  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!json.access_token) throw new Error('Shopify access token döndürmedi');

  return {
    owner: ownerKey(cfg),
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 86_399) * 1000,
    scopes: (json.scope ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  };
}

function ownerKey(cfg: ShopifyConfig): string {
  return `${cfg.domain}|${cfg.clientId ?? ''}`;
}

/** Gecerli bir Admin API token'i dondurur; gerekiyorsa yenisini alir. */
export async function getAccessToken(): Promise<string> {
  const cfg = await getShopifyConfig();
  if (cfg.staticToken) return cfg.staticToken;

  const cached = globalForToken.__shopifyToken;
  if (
    cached &&
    cached.owner === ownerKey(cfg) &&
    cached.expiresAt - REFRESH_MARGIN_MS > Date.now()
  ) {
    return cached.token;
  }

  const fresh = await fetchClientCredentialsToken(cfg);
  globalForToken.__shopifyToken = fresh;
  return fresh.token;
}

/**
 * Token'a islenmis izinler ve eksik olanlar.
 *
 * Izinler token uretilirken uygulamanin YAYINLANMIS surumunden aliniyor; Dev
 * Dashboard'da scope eklemek tek basina yetmez, yeni surum yayinlanip token'in
 * da yenilenmesi gerekir (asagidaki refreshAccessToken bunu yapar).
 * Static (shpat_) token'da izinler istek aninda ogrenilemez, bos doner.
 */
export async function getTokenScopes(): Promise<{ granted: string[]; missing: string[] }> {
  const cfg = await getShopifyConfig();
  if (cfg.staticToken) return { granted: [], missing: [] };

  await getAccessToken();
  const granted = globalForToken.__shopifyToken?.scopes ?? [];
  return {
    granted,
    missing: REQUIRED_SCOPES.filter((s) => !hasScope(granted, s)),
  };
}

/**
 * Shopify'da write_X izni read_X'i de kapsar ve token'in scope listesinde read_X
 * ayrica yer almaz. Duz `includes` kontrolu bu yuzden yanlis "eksik izin" uyarisi
 * veriyordu.
 */
function hasScope(granted: string[], scope: string): boolean {
  if (granted.includes(scope)) return true;
  if (scope.startsWith('read_')) return granted.includes(`write_${scope.slice('read_'.length)}`);
  return false;
}

/** Onbellekteki token'i atar; yeni scope'lar yayinlandiktan sonra kullanilir. */
export function refreshAccessToken(): void {
  globalForToken.__shopifyToken = undefined;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
}

async function parseGraphQL<T>(res: Response): Promise<T> {
  const json = (await res.json()) as GraphQLResponse<T>;
  if (json.errors?.length) {
    throw new Error(`Shopify GraphQL: ${json.errors.map((e) => e.message).join('; ')}`);
  }
  if (!json.data) throw new Error('Shopify boş yanıt döndürdü');
  return json.data;
}

/** Admin GraphQL cagrisi; transport ve GraphQL seviyesindeki hatalari firlatir. */
export async function shopifyGraphQL<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const cfg = await getShopifyConfig();
  const url = `https://${cfg.domain}/admin/api/${cfg.apiVersion}/graphql.json`;
  const send = (token: string) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query, variables }),
    });

  let res = await send(await getAccessToken());

  // Client credentials token'i 24 saatte bir doluyor; 401'de bir kez tazeleyip
  // tekrar dene (uzun suren toplu gonderimlerde sinira denk gelinebiliyor).
  if (res.status === 401 && !cfg.staticToken) {
    globalForToken.__shopifyToken = undefined;
    res = await send(await getAccessToken());
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Shopify HTTP ${res.status}: ${body.slice(0, 500)}`);
  }

  return parseGraphQL<T>(res);
}

/** Mutation'larin userErrors dizisini tek tip hataya cevirir. */
export function throwUserErrors(
  errors: Array<{ field?: string[] | null; message: string }> | undefined,
  context: string,
): void {
  if (!errors?.length) return;
  const detail = errors
    .map((e) => `${e.field?.join('.') ?? 'genel'}: ${e.message}`)
    .join(' | ');
  throw new Error(`${context} → ${detail}`);
}
