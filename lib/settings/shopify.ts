import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { decrypt, encrypt, mask } from './crypto';

/**
 * Shopify baglanti ayarlari.
 *
 * Oncelik: ayarlar sayfasindan kaydedilen (veritabani) > .env degiskenleri.
 * Boylece mevcut .env kurulumu calismaya devam eder, ama kullanici kendi
 * magazasini arayuzden ekleyip degistirebilir.
 */

const KEY = 'shopify';

export const DEFAULT_API_VERSION = '2026-04';

export type ShopifyAuthMode = 'client_credentials' | 'admin_token';

export interface ShopifySettings {
  domain: string;
  apiVersion: string;
  authMode: ShopifyAuthMode;
  clientId?: string;
  clientSecret?: string;
  adminToken?: string;
  source: 'database' | 'env';
}

/** Veritabaninda saklanan bicim: gizli alanlar sifreli. */
const storedSchema = z.object({
  domain: z.string(),
  apiVersion: z.string(),
  authMode: z.enum(['client_credentials', 'admin_token']),
  clientId: z.string().optional(),
  clientSecretEnc: z.string().optional(),
  adminTokenEnc: z.string().optional(),
});
type Stored = z.infer<typeof storedSchema>;

/** "https://magaza.myshopify.com/admin" -> "magaza.myshopify.com" */
export function normalizeDomain(input: string): string {
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '').split('/')[0];
  if (d && !d.includes('.')) d = `${d}.myshopify.com`;
  return d;
}

async function readStored(): Promise<Stored | null> {
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  if (!row) return null;
  try {
    return storedSchema.parse(JSON.parse(row.value));
  } catch {
    return null;
  }
}

function fromEnv(): ShopifySettings | null {
  const domain = process.env.SHOPIFY_STORE_DOMAIN?.trim();
  if (!domain) return null;
  const adminToken = process.env.SHOPIFY_ADMIN_TOKEN?.trim() || undefined;
  return {
    domain: normalizeDomain(domain),
    apiVersion: process.env.SHOPIFY_API_VERSION?.trim() || DEFAULT_API_VERSION,
    authMode: adminToken ? 'admin_token' : 'client_credentials',
    clientId: process.env.SHOPIFY_CLIENT_ID?.trim() || undefined,
    clientSecret: process.env.SHOPIFY_CLIENT_SECRET?.trim() || undefined,
    adminToken,
    source: 'env',
  };
}

/** Etkin ayarlar (sifreler cozulmus). Hic ayar yoksa null. */
export async function getShopifySettings(): Promise<ShopifySettings | null> {
  const stored = await readStored();
  if (stored) {
    return {
      domain: stored.domain,
      apiVersion: stored.apiVersion,
      authMode: stored.authMode,
      clientId: stored.clientId,
      clientSecret: stored.clientSecretEnc ? decrypt(stored.clientSecretEnc) ?? undefined : undefined,
      adminToken: stored.adminTokenEnc ? decrypt(stored.adminTokenEnc) ?? undefined : undefined,
      source: 'database',
    };
  }
  return fromEnv();
}

/** Arayuze gidecek hali: gizli alanlar asla acik gonderilmez. */
export async function getShopifySettingsPublic() {
  const s = await getShopifySettings();
  if (!s) return null;
  return {
    domain: s.domain,
    apiVersion: s.apiVersion,
    authMode: s.authMode,
    clientId: s.clientId ?? '',
    clientSecretMasked: mask(s.clientSecret),
    adminTokenMasked: mask(s.adminToken),
    source: s.source,
  };
}

export const saveInputSchema = z
  .object({
    domain: z.string().min(1, 'Mağaza adresi gerekli'),
    apiVersion: z
      .string()
      .regex(/^\d{4}-\d{2}$|^unstable$/, 'API sürümü YYYY-AA biçiminde olmalı (örn. 2026-04)')
      .default(DEFAULT_API_VERSION),
    authMode: z.enum(['client_credentials', 'admin_token']),
    clientId: z.string().optional(),
    /** Bos birakilirsa kayitli olan korunur. */
    clientSecret: z.string().optional(),
    /** Bos birakilirsa kayitli olan korunur. */
    adminToken: z.string().optional(),
  })
  .transform((v) => ({ ...v, domain: normalizeDomain(v.domain) }));

export type SaveInput = z.infer<typeof saveInputSchema>;

/**
 * Ayarlari kaydeder. Gizli alan bos gelirse mevcut (veritabanindaki veya
 * .env'deki) deger korunur; boylece kullanici her seferinde tekrar girmek
 * zorunda kalmaz.
 */
export async function saveShopifySettings(input: SaveInput): Promise<void> {
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(input.domain)) {
    throw new Error('Mağaza adresi "magaza-adi.myshopify.com" biçiminde olmalı');
  }

  const current = await getShopifySettings();
  const clientSecret = input.clientSecret?.trim() || current?.clientSecret;
  const adminToken = input.adminToken?.trim() || current?.adminToken;
  const clientId = input.clientId?.trim() || undefined;

  if (input.authMode === 'client_credentials') {
    if (!clientId) throw new Error('Client ID gerekli');
    if (!clientSecret) throw new Error('Client secret gerekli');
    if (clientSecret.startsWith('shpat_')) {
      throw new Error(
        'Girdiğiniz değer bir Admin API token (shpat_…) gibi görünüyor. "Admin API token" seçeneğini kullanın.',
      );
    }
  } else {
    if (!adminToken) throw new Error('Admin API token gerekli');
    if (adminToken.startsWith('shpss_')) {
      throw new Error(
        'Girdiğiniz değer bir client secret (shpss_…); doğrudan token olarak kullanılamaz. ' +
          '"Client ID + Secret" seçeneğini kullanın.',
      );
    }
  }

  const stored: Stored = {
    domain: input.domain,
    apiVersion: input.apiVersion,
    authMode: input.authMode,
    clientId,
    clientSecretEnc: clientSecret ? encrypt(clientSecret) : undefined,
    adminTokenEnc: adminToken ? encrypt(adminToken) : undefined,
  };

  await prisma.setting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: JSON.stringify(stored) },
    update: { value: JSON.stringify(stored) },
  });
}

/** Kayitli ayarlari siler; varsa .env degerlerine geri donulur. */
export async function clearShopifySettings(): Promise<void> {
  await prisma.setting.deleteMany({ where: { key: KEY } });
}
