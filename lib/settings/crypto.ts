import 'server-only';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { STORAGE } from '@/lib/paths';
import { IS_CLOUD } from '@/lib/runtime';

/**
 * Ayarlardaki gizli alanlar (client secret, admin token) veritabaninda duz metin
 * durmasin diye AES-256-GCM ile sifrelenir.
 *
 * Anahtar kaynagi:
 *  1. APP_SECRET ortam degiskeni (sunucuda/Netlify'da bu kullanilmali)
 *  2. Tanimli degilse yerelde storage/.app-secret dosyasi uretilir ve kullanilir.
 *
 * Anahtar degisirse eski sifreli degerler cozulemez; kullanici ayarlar
 * sayfasindan bilgileri yeniden girmelidir (decrypt null doner, hata firlatmaz).
 */

const KEY_FILE = path.join(STORAGE, '.app-secret');
const PREFIX = 'enc:v1:';

let cachedKey: Buffer | null = null;

function loadKey(): Buffer {
  if (cachedKey) return cachedKey;

  const fromEnv = process.env.APP_SECRET?.trim();
  if (fromEnv) {
    // Her uzunluktaki metni 32 baytlik anahtara cevir.
    cachedKey = crypto.createHash('sha256').update(fromEnv).digest();
    return cachedKey;
  }

  // Bulutta dosya sistemi salt okunur ve kalici degil; anahtar ortamdan gelmeli.
  if (IS_CLOUD) {
    throw new Error(
      'APP_SECRET ortam değişkeni tanımlı değil. Netlify > Site configuration > ' +
        'Environment variables bölümünden uzun, rastgele bir değer ekleyin.',
    );
  }

  try {
    cachedKey = Buffer.from(fs.readFileSync(KEY_FILE, 'utf8').trim(), 'base64');
    if (cachedKey.length === 32) return cachedKey;
  } catch {
    // dosya yok; asagida uretilecek
  }

  const fresh = crypto.randomBytes(32);
  try {
    fs.mkdirSync(STORAGE, { recursive: true });
    fs.writeFileSync(KEY_FILE, fresh.toString('base64'), { encoding: 'utf8', mode: 0o600 });
  } catch {
    throw new Error(
      'Ayar şifreleme anahtarı yazılamadı. Sunucu ortamında APP_SECRET ortam değişkenini tanımlayın.',
    );
  }
  cachedKey = fresh;
  return cachedKey;
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', loadKey(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, data]).toString('base64');
}

/** Cozulemezse (anahtar degismis, veri bozuk) null doner. */
export function decrypt(value: string): string | null {
  if (!value.startsWith(PREFIX)) return null;
  try {
    const raw = Buffer.from(value.slice(PREFIX.length), 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', loadKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** Arayuzde gosterim icin: yalnizca son 4 karakter. */
export function mask(value: string | undefined | null): string | null {
  if (!value) return null;
  return value.length <= 4 ? '••••' : `••••••${value.slice(-4)}`;
}
