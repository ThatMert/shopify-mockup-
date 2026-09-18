/**
 * Uygulamanin nerede calistigi ve hangi ozelliklerin acik oldugu.
 *
 * Ayni kod iki ortamda calisir:
 *  - local: kendi bilgisayarinda; SQLite, yerel dosyalar, ComfyUI (AI) destegi.
 *  - cloud: Netlify; Postgres (Netlify Database), Netlify Blobs, AI YOK.
 *    Mockup'lar yalnizca perspektif kompozisyonla uretilir.
 *
 * Netlify build ve fonksiyonlarinda NETLIFY=true otomatik tanimlidir.
 * DEPLOY_TARGET=cloud ile yerelde de bulut modu denenebilir.
 */

// NOT: DEPLOY_TARGET, next.config.mjs'teki `env` ile derleme aninda koda
// gomulur (Netlify derlemesinde NETLIFY=true oldugu icin "cloud" olur).
// NETLIFY degiskeni fonksiyonlarin calisma aninda her zaman bulunmayabiliyor.
export const IS_CLOUD =
  process.env.DEPLOY_TARGET === 'cloud' || process.env.NETLIFY === 'true';

/** ComfyUI tabanli uretim (Kontext, harmonizasyon). Bulutta daima kapali. */
export const AI_ENABLED = !IS_CLOUD && process.env.AI_ENABLED !== 'false';

/** Depolama surucusu: bulutta Netlify Blobs, yerelde dosya sistemi. */
export const STORAGE_DRIVER: 'blobs' | 'fs' =
  (process.env.STORAGE_DRIVER as 'blobs' | 'fs' | undefined) ?? (IS_CLOUD ? 'blobs' : 'fs');

/**
 * Tek istekte harcanabilecek sure (ms). Netlify senkron fonksiyonlari 60 sn'de
 * kesiliyor; paylar birakilarak uzun isler parca parca yurutulur.
 */
export const REQUEST_BUDGET_MS = IS_CLOUD ? 40_000 : 10 * 60_000;
