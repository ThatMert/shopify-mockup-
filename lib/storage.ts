import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '@/lib/paths';
import { STORAGE_DRIVER } from '@/lib/runtime';

/**
 * Dosya depolama soyutlamasi.
 *
 * Anahtarlar, veritabaninda zaten saklanan proje-goreli yollardir
 * (orn. "storage/templates/glass/front.png"). Boylece:
 *  - yerelde (fs) anahtar = diskteki dosya yolu,
 *  - bulutta (Netlify Blobs) anahtar = ayni metin
 * olur ve DB kayitlari iki ortam arasinda degismeden tasinabilir.
 */

export interface StoredFile {
  data: Buffer;
  /** Son degisme zamani (ms). Tarayici cache'ini kirmak icin kullanilir. */
  mtime: number;
}

export interface Storage {
  read(key: string): Promise<StoredFile | null>;
  write(key: string, data: Buffer): Promise<{ mtime: number }>;
  delete(key: string): Promise<void>;
  /** Var mi, varsa mtime. Icerigi okumaz. */
  stat(key: string): Promise<{ exists: boolean; mtime: number }>;
  /** Verilen onekin HEMEN altindaki dosyalar (alt klasorlere inmez). */
  list(prefix: string): Promise<string[]>;
}

/** "storage/.." disina cikan veya mutlak anahtarlari reddet. */
export function normalizeKey(key: string): string {
  const k = key.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!k.startsWith('storage/') || k.split('/').includes('..')) {
    throw new Error(`Geçersiz depolama anahtarı: ${key}`);
  }
  return k;
}

// ---------------------------------------------------------------- fs

const fsStorage: Storage = {
  async read(key) {
    const abs = path.join(ROOT, normalizeKey(key));
    try {
      const [data, st] = await Promise.all([fs.readFile(abs), fs.stat(abs)]);
      return { data, mtime: Math.floor(st.mtimeMs) };
    } catch {
      return null;
    }
  },
  async write(key, data) {
    const abs = path.join(ROOT, normalizeKey(key));
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, data);
    const st = await fs.stat(abs);
    return { mtime: Math.floor(st.mtimeMs) };
  },
  async delete(key) {
    await fs.unlink(path.join(ROOT, normalizeKey(key))).catch(() => undefined);
  },
  async stat(key) {
    try {
      const st = await fs.stat(path.join(ROOT, normalizeKey(key)));
      return { exists: st.isFile(), mtime: Math.floor(st.mtimeMs) };
    } catch {
      return { exists: false, mtime: 0 };
    }
  },
  async list(prefix) {
    const dir = path.join(ROOT, normalizeKey(prefix.endsWith('/') ? prefix : `${prefix}/`));
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return entries.filter((e) => e.isFile()).map((e) => e.name).sort();
    } catch {
      return [];
    }
  },
};

// ---------------------------------------------------------------- Netlify Blobs

const STORE_NAME = 'files';

async function blobStore() {
  const { getStore } = await import('@netlify/blobs');
  // Fonksiyonlarda siteID/token otomatik gelir. Yerelden (import betigi vb.)
  // erismek icin NETLIFY_SITE_ID + NETLIFY_BLOBS_TOKEN tanimlanabilir.
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  return siteID && token
    ? getStore({ name: STORE_NAME, siteID, token, consistency: 'strong' })
    : getStore({ name: STORE_NAME, consistency: 'strong' });
}

const blobStorage: Storage = {
  async read(key) {
    const store = await blobStore();
    const res = await store.getWithMetadata(normalizeKey(key), { type: 'arrayBuffer' });
    if (!res) return null;
    return {
      data: Buffer.from(res.data),
      mtime: Number((res.metadata as { mtime?: number })?.mtime ?? 0),
    };
  },
  async write(key, data) {
    const store = await blobStore();
    const mtime = Date.now();
    await store.set(
      normalizeKey(key),
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
      { metadata: { mtime } },
    );
    return { mtime };
  },
  async delete(key) {
    const store = await blobStore();
    await store.delete(normalizeKey(key));
  },
  async stat(key) {
    const store = await blobStore();
    const meta = await store.getMetadata(normalizeKey(key));
    if (!meta) return { exists: false, mtime: 0 };
    return { exists: true, mtime: Number((meta.metadata as { mtime?: number })?.mtime ?? 0) };
  },
  async list(prefix) {
    const store = await blobStore();
    const p = normalizeKey(prefix.endsWith('/') ? prefix : `${prefix}/`);
    const { blobs } = await store.list({ prefix: p, directories: true });
    return blobs
      .map((b) => b.key.slice(p.length))
      .filter((name) => name && !name.includes('/'))
      .sort();
  },
};

export const storage: Storage = STORAGE_DRIVER === 'blobs' ? blobStorage : fsStorage;

/** Okur; yoksa anlasilir hata firlatir. */
export async function readRequired(key: string): Promise<Buffer> {
  const file = await storage.read(key);
  if (!file) throw new Error(`Dosya bulunamadı: ${key}`);
  return file.data;
}
