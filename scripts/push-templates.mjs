/**
 * Yerel mockup sablonlarini (gorseller + .placement.json yerlesimleri)
 * yayindaki bulut surumune aktarir.
 *
 * Kullanim:
 *   APP_URL=https://site-adi.netlify.app IMPORT_TOKEN=... node scripts/push-templates.mjs
 *
 * IMPORT_TOKEN, Netlify ortam degiskenlerine gecici olarak eklenen tek seferlik
 * rastgele bir degerdir; aktarim bitince Netlify'dan silinmelidir. Giris sifresi
 * bu betige verilmez.
 *
 * Istek basina ~4.5 MB sinir oldugu icin daha buyuk gorseller gonderilmeden
 * once kucultulur (sablonlar sunucuda zaten en fazla 3000 px saklanir).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templatesDir = path.join(root, 'storage', 'templates');

const APP_URL = (process.env.APP_URL ?? '').replace(/\/$/, '');
const TOKEN = process.env.IMPORT_TOKEN ?? '';
const MAX_BYTES = 4 * 1024 * 1024;

if (!APP_URL || !TOKEN) {
  console.error('APP_URL ve IMPORT_TOKEN ortam değişkenleri gerekli.');
  process.exit(1);
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(abs);
    else yield abs;
  }
}

const files = [...walk(templatesDir)].filter((f) =>
  /\.(png|jpe?g|webp)$/i.test(f) || f.endsWith('.placement.json'),
);

let ok = 0;
let failed = 0;

for (const abs of files) {
  const key = path.relative(root, abs).split(path.sep).join('/');
  let data = fs.readFileSync(abs);

  if (data.length > MAX_BYTES && !key.endsWith('.json')) {
    // Seffafligi korumak icin PNG kalir; olcu kuculterek sinira indirilir.
    let side = 3000;
    do {
      data = await sharp(fs.readFileSync(abs))
        .resize({ width: side, height: side, fit: 'inside', withoutEnlargement: true })
        .png({ compressionLevel: 9 })
        .toBuffer();
      side = Math.round(side * 0.85);
    } while (data.length > MAX_BYTES && side > 800);
  }

  const form = new FormData();
  form.append('key', key);
  form.append('file', new Blob([data]), path.basename(abs));

  const res = await fetch(`${APP_URL}/api/admin/import-file`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: form,
  });
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));

  if (res.ok) {
    ok++;
    console.log(`✓ ${key}  (${(data.length / 1024).toFixed(0)} KB)`);
  } else {
    failed++;
    console.log(`✕ ${key}  → ${json.error ?? res.status}`);
  }
}

console.log(`\n${ok} dosya aktarıldı${failed ? `, ${failed} başarısız` : ''}.`);
process.exit(failed ? 1 : 0);
