import 'server-only';
import { UA, decodeEntities, metaContent, upgradeToOriginal } from './pinterest';

/**
 * Bir Pinterest koleksiyonundaki (board) pinlerin listesi.
 *
 * Iki yol var:
 *  - API:    PINTEREST_ACCESS_TOKEN tanimliysa resmi v5 API (tum pinler, sayfali).
 *  - Scrape: token yoksa veya API hata verirse board sayfasindaki gomulu JSON.
 *
 * Ikisi de ayni BoardPin sekline donuyor; hangisinin kullanildigi `source`
 * alaninda tasinir ve arayuzde gosterilir.
 */

const API_BASE = 'https://api.pinterest.com/v5';

export interface BoardPin {
  /** Pinterest pin id'si; pinterest.com/pin/{pinId} adresini kurar. */
  pinId: string;
  pinUrl: string;
  /** Grid'de gosterilecek kucuk varyant. */
  thumbUrl: string;
  /** En yuksek cozunurluklu varyant (images.orig veya /originals/ yukseltmesi). */
  imageUrl: string;
  /** Pin basligi/aciklamasi; urun metni on dolgusu icin kullanilir. */
  note: string;
}

export interface BoardResult {
  boardId: string | null;
  boardName: string;
  boardUrl: string;
  source: 'api' | 'scrape';
  pins: BoardPin[];
  /** Scrape yolunda tum pinler gelmemis olabilir; UI bunu uyari olarak gosterir. */
  partial: boolean;
}

export interface BoardRef {
  /** Sayisal board id (varsa dogrudan API'ye gider). */
  boardId?: string;
  username?: string;
  slug?: string;
  /** Kanonik board adresi. */
  url: string;
}

function pinUrlFor(pinId: string): string {
  return `https://www.pinterest.com/pin/${pinId}/`;
}

/**
 * Girdiyi board referansina cevirir. Kabul edilenler:
 *  - https://www.pinterest.com/<kullanici>/<board-slug>/
 *  - pinterest.com/<kullanici>/<board>/ (protokolsuz)
 *  - ciplak sayisal board id (orn. "1234567890123456")
 */
export function parseBoardRef(input: string): BoardRef {
  const raw = input.trim();
  if (!raw) throw new Error('Board adresi boş');

  if (/^\d{6,}$/.test(raw)) {
    return { boardId: raw, url: `https://www.pinterest.com/?boardId=${raw}` };
  }

  let url: URL;
  try {
    url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    throw new Error('Geçersiz board adresi');
  }

  if (!/(^|\.)(pinterest\.[a-z.]+|pin\.it)$/i.test(url.hostname)) {
    throw new Error('Bu bir Pinterest bağlantısı değil');
  }

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'pin') {
    throw new Error('Bu bir pin bağlantısı — koleksiyon (board) bağlantısı gerekli');
  }
  if (parts.length < 2) {
    throw new Error('Board bağlantısı <kullanıcı>/<board> biçiminde olmalı');
  }

  const [username, slug] = parts;
  return {
    username,
    slug,
    url: `https://www.pinterest.com/${username}/${slug}/`,
  };
}

// --- Resmi v5 API ---------------------------------------------------------

async function apiGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Pinterest API hatası (HTTP ${res.status}): ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

interface ApiImage {
  url?: string;
  width?: number;
  height?: number;
}

interface ApiPin {
  id: string;
  link?: string | null;
  title?: string | null;
  description?: string | null;
  alt_text?: string | null;
  media?: { images?: Record<string, ApiImage> } | null;
}

/** v5 `media.images` sozlugunden en buyuk ve en kucuk varyanti secer. */
function pickVariants(
  images: Record<string, ApiImage> | undefined,
): { imageUrl: string; thumbUrl: string } | null {
  const entries = Object.entries(images ?? {}).filter(
    (e): e is [string, ApiImage] => typeof e[1]?.url === 'string' && e[1].url.length > 0,
  );
  if (entries.length === 0) return null;

  // "orig" varsa en buyugudur; yoksa genislige gore siralanir ("1200x" > "600x").
  const widthOf = ([key, value]: [string, ApiImage]) =>
    value.width ?? Number(key.match(/^(\d+)/)?.[1] ?? 0);

  const sorted = [...entries].sort((a, b) => widthOf(a) - widthOf(b));
  const orig = entries.find(([key]) => {
    const k = key.toLowerCase();
    return k === 'orig' || k === 'originals';
  });
  const largest = orig ?? sorted[sorted.length - 1];

  // Thumbnail: 200px'in ustundeki en kucuk varyant (yoksa en kucugu).
  const thumb = sorted.find((e) => widthOf(e) >= 200) ?? sorted[0];

  return {
    imageUrl: upgradeToOriginal(largest[1].url as string),
    thumbUrl: thumb[1].url as string,
  };
}

/** Yalnizca harf/rakam birakan basit slug; board adini URL slug'iyla karsilastirmak icin. */
function slugifyName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Board id bilinmiyorsa kullanicinin board listesinden isim/slug ile bulur. */
async function findBoardId(ref: BoardRef, token: string): Promise<string> {
  if (ref.boardId) return ref.boardId;

  let bookmark: string | undefined;
  do {
    const query = new URLSearchParams({ page_size: '100' });
    if (bookmark) query.set('bookmark', bookmark);
    const page = await apiGet<{ items: Array<{ id: string; name: string }>; bookmark?: string }>(
      `/boards?${query.toString()}`,
      token,
    );
    const hit = page.items.find((b) => slugifyName(b.name) === ref.slug);
    if (hit) return hit.id;
    bookmark = page.bookmark || undefined;
  } while (bookmark);

  throw new Error(
    `Board API ile bulunamadı: ${ref.slug}. Token bu board'un sahibine ait olmalı.`,
  );
}

export async function fetchBoardPinsApi(ref: BoardRef, token: string): Promise<BoardResult> {
  const boardId = await findBoardId(ref, token);
  const board = await apiGet<{ id: string; name: string }>(`/boards/${boardId}`, token);

  const pins: BoardPin[] = [];
  let bookmark: string | undefined;

  do {
    const query = new URLSearchParams({ page_size: '100' });
    if (bookmark) query.set('bookmark', bookmark);
    const page = await apiGet<{ items: ApiPin[]; bookmark?: string }>(
      `/boards/${boardId}/pins?${query.toString()}`,
      token,
    );

    for (const item of page.items) {
      const variants = pickVariants(item.media?.images);
      if (!variants) continue; // video/karma pinleri atla
      pins.push({
        pinId: item.id,
        pinUrl: pinUrlFor(item.id),
        ...variants,
        note: (item.title || item.description || item.alt_text || '').trim(),
      });
    }

    bookmark = page.bookmark || undefined;
  } while (bookmark && pins.length < 1000);

  return {
    boardId: board.id,
    boardName: board.name,
    boardUrl: ref.url,
    source: 'api',
    pins,
    partial: false,
  };
}

// --- Scrape fallback ------------------------------------------------------

/** Sayfadaki gomulu JSON bloklarini (Pinterest __PWS_DATA__ dahil) dondurur. */
function embeddedJsonBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const re = /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(re)) {
    try {
      blocks.push(JSON.parse(match[1]));
    } catch {
      // Bozuk/kismi blok - atla.
    }
  }
  return blocks;
}

/**
 * Gomulu JSON agacini gezip pin nesnelerini toplar.
 * Pin nesnesi = sayisal string bir `id` + `images` sozlugu tasiyan nesne.
 */
function collectPinsFromJson(node: unknown, out: Map<string, BoardPin>): void {
  if (Array.isArray(node)) {
    for (const child of node) collectPinsFromJson(child, out);
    return;
  }
  if (!node || typeof node !== 'object') return;

  const obj = node as Record<string, unknown>;
  const id = obj.id;
  const images = obj.images;

  if (typeof id === 'string' && /^\d{6,}$/.test(id) && images && typeof images === 'object') {
    const variants = pickVariants(images as Record<string, ApiImage>);
    if (variants && !out.has(id)) {
      const note = [obj.grid_title, obj.title, obj.description, obj.alt_text].find(
        (v) => typeof v === 'string' && v.trim().length > 0,
      );
      out.set(id, {
        pinId: id,
        pinUrl: pinUrlFor(id),
        ...variants,
        note: typeof note === 'string' ? decodeEntities(note.trim()) : '',
      });
    }
  }

  for (const value of Object.values(obj)) collectPinsFromJson(value, out);
}

export async function fetchBoardPinsScrape(ref: BoardRef): Promise<BoardResult> {
  if (!ref.username || !ref.slug) {
    throw new Error(
      'Token olmadan çıplak board id ile pin listesi alınamaz — board adresini girin',
    );
  }

  const res = await fetch(ref.url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
  });
  if (!res.ok) throw new Error(`Board sayfası alınamadı (HTTP ${res.status})`);
  const html = await res.text();

  const found = new Map<string, BoardPin>();
  for (const block of embeddedJsonBlocks(html)) collectPinsFromJson(block, found);

  const pins = [...found.values()];
  if (pins.length === 0) {
    throw new Error(
      'Board sayfasından pin çıkarılamadı. Board gizli olabilir veya Pinterest sayfa yapısını ' +
        'değiştirmiş olabilir — PINTEREST_ACCESS_TOKEN tanımlayarak resmî API yolunu kullanın.',
    );
  }

  const name = metaContent(html, 'og:title')?.trim() ?? ref.slug;

  return {
    boardId: null,
    boardName: decodeEntities(name),
    boardUrl: ref.url,
    source: 'scrape',
    pins,
    // Scrape yalnizca ilk ekranda yuklenen pinleri gorur.
    partial: true,
  };
}

/**
 * Board pinlerini getirir: token varsa once resmi API, hata alirsa scrape'e duser.
 * Hangi yolun kullanildigi sonucta `source` olarak doner.
 */
export async function fetchBoardPins(input: string): Promise<BoardResult> {
  const ref = parseBoardRef(input);
  const token = process.env.PINTEREST_ACCESS_TOKEN?.trim();

  if (token) {
    try {
      return await fetchBoardPinsApi(ref, token);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[board] API başarısız, scrape yoluna düşülüyor: ${message}`);
    }
  }

  return fetchBoardPinsScrape(ref);
}
