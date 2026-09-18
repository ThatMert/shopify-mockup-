import 'server-only';
import sharp from 'sharp';
import { IS_CLOUD } from '@/lib/runtime';
import { readRequired, storage } from '@/lib/storage';

/** Depolama anahtarlari (DB'de de bu bicimde saklanir). */
const KEY = {
  sources: 'storage/sources',
  processed: 'storage/processed',
  mockups: 'storage/mockups',
} as const;

/**
 * Bulutta dosyalar tarayiciya tek istekte (en fazla 6 MB) servis ediliyor;
 * Pinterest'ten gelen 30 MB'lik PNG'ler bu yuzden makul olcuye indirilir.
 */
const CLOUD_SOURCE_MAX = 3000;

/** Tasarim gorselini ComfyUI'ye vermeden once normalize eden ayarlar. */
export interface PrepareOptions {
  /** Kenarlardaki duz/seffaf bosluk kirpilsin mi. */
  trim?: boolean;
  /** Kirpma esigi (0-100); yuksek deger daha agresif kirpar. */
  trimThreshold?: number;
  /** Uzun kenarin hedef pikseli. */
  maxSize?: number;
  /**
   * Tasarimin cevresine eklenecek bosluk orani (0-0.3).
   *
   * Kompozisyon yolunda baski alanini yerlesim dortgeni belirledigi icin
   * varsayilan 0'dir; bosluk eklemek tasarimi isaretlenen alandan kucuk
   * gosterir. Sadece uretken (ComfyUI) yolunda modele nefes payi vermek
   * istenirse 0'in ustune cikarin.
   */
  padding?: number;
  /** Seffaf PNG'lerde arka planin doldurulacagi renk; null ise seffaf kalir. */
  background?: string | null;
}

const DEFAULTS: Required<PrepareOptions> = {
  trim: true,
  trimThreshold: 12,
  maxSize: 1536,
  padding: 0,
  background: null,
};

export interface PreparedImage {
  /** Proje-goreli yol. */
  path: string;
  width: number;
  height: number;
  bytes: number;
}

/** Ham kaynak gorseli storage/sources altina kaydeder. */
export async function saveSource(buffer: Buffer, draftId: string): Promise<PreparedImage> {
  let pipeline = sharp(buffer).rotate();
  if (IS_CLOUD) {
    pipeline = pipeline.resize({
      width: CLOUD_SOURCE_MAX,
      height: CLOUD_SOURCE_MAX,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }
  // Formati normalize et: her sey PNG olarak saklanir, alfa korunur.
  const { data: png, info } = await pipeline
    .png({ compressionLevel: 6 })
    .toBuffer({ resolveWithObject: true });

  const key = `${KEY.sources}/${draftId}-source.png`;
  await storage.write(key, png);
  return { path: key, width: info.width, height: info.height, bytes: png.length };
}

/**
 * Tasarimi mockup'a hazirlar: bos kenarlari kirpar, uzun kenari sinirlar,
 * cevresine nefes payi birakir ve PNG olarak storage/processed altina yazar.
 */
export async function prepareDesign(
  sourceRelPath: string,
  draftId: string,
  options: PrepareOptions = {},
): Promise<PreparedImage> {
  const opts = { ...DEFAULTS, ...options };
  const source = await readRequired(sourceRelPath);

  let image = sharp(source).rotate(); // EXIF yonunu uygula

  if (opts.trim) {
    // trim() bos bir gorselde hata verebilir; basarisiz olursa kirpmadan devam et.
    try {
      image = sharp(await image.trim({ threshold: opts.trimThreshold }).toBuffer());
    } catch {
      image = sharp(await sharp(source).rotate().toBuffer());
    }
  }

  image = image.resize({
    width: opts.maxSize,
    height: opts.maxSize,
    fit: 'inside',
    withoutEnlargement: true,
  });

  let buffer = await image.png().toBuffer();

  if (opts.padding > 0) {
    const meta = await sharp(buffer).metadata();
    const pad = Math.round(Math.max(meta.width ?? 0, meta.height ?? 0) * opts.padding);
    buffer = await sharp(buffer)
      .extend({
        top: pad,
        bottom: pad,
        left: pad,
        right: pad,
        background: opts.background ?? { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
  }

  if (opts.background) {
    buffer = await sharp(buffer).flatten({ background: opts.background }).png().toBuffer();
  }

  const key = `${KEY.processed}/${draftId}-design.png`;
  await storage.write(key, buffer);
  const meta = await sharp(buffer).metadata();

  return {
    path: key,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    bytes: buffer.length,
  };
}

/**
 * Uretilen mockup'i kaydeder ve olculerini dondurur.
 *
 * Bulutta JPEG (q92) olarak saklanir: 3000 px'lik bir fotograf PNG'de
 * 10 MB'i asip Netlify'in 6 MB yanit sinirini deliyor; mockup'ta alfa
 * kanali da yok (sablon fotografi RGB), dolayisiyla kayip hissedilmez.
 */
export async function saveMockup(buffer: Buffer, filename: string): Promise<PreparedImage> {
  let data = buffer;
  let name = filename;
  if (IS_CLOUD) {
    data = await sharp(buffer).flatten({ background: '#ffffff' }).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
    name = filename.replace(/\.[^.]+$/, '') + '.jpg';
  }

  const key = `${KEY.mockups}/${name}`;
  await storage.write(key, data);
  const meta = await sharp(data).metadata();
  return { path: key, width: meta.width ?? 0, height: meta.height ?? 0, bytes: data.length };
}

/** Shopify'a gondermeden once boyutu makul seviyeye indirir. */
export async function toUploadJpeg(relPath: string, maxSize = 2048): Promise<Buffer> {
  return sharp(await readRequired(relPath))
    .resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}
