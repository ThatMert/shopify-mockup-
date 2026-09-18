/**
 * config/ altindaki JSON'lari (materyaller, CSV varsayilanlari) tek bir
 * TypeScript modulune gomer: lib/registry/bundled.generated.ts
 *
 * Neden: Netlify'da sunucu kodu bir fonksiyon paketine derleniyor ve Next
 * yalnizca import edilen dosyalari pakete koyuyor. `fs.readdir(config/...)`
 * gibi dinamik okumalar orada guvenilir degil. Yerelde (fs modu) bu modul
 * kullanilmaz; dosyalar her istekte diskten okunur, yani JSON'u duzenleyip
 * yeniden baslatmadan denemek mumkun olmaya devam eder.
 *
 * `npm run build` oncesinde (prebuild) otomatik calisir.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const materialsDir = path.join(root, 'config', 'materials');
const out = path.join(root, 'lib', 'registry', 'bundled.generated.ts');

const materials = fs
  .readdirSync(materialsDir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => ({ file: f, data: JSON.parse(fs.readFileSync(path.join(materialsDir, f), 'utf8')) }));

let csv = null;
try {
  csv = JSON.parse(fs.readFileSync(path.join(root, 'config', 'csv.json'), 'utf8'));
} catch {
  // opsiyonel
}

const body = `// BU DOSYA OTOMATIK URETILIR — elle duzenlemeyin.
// Kaynak: config/materials/*.json, config/csv.json  ·  Uretici: scripts/bundle-config.mjs

export const BUNDLED_MATERIALS: Array<{ file: string; data: unknown }> = ${JSON.stringify(materials, null, 2)};

export const BUNDLED_CSV: unknown = ${JSON.stringify(csv, null, 2)};
`;

fs.writeFileSync(out, body, 'utf8');
console.log(`[bundle-config] ${materials.length} materyal gömüldü → ${path.relative(root, out)}`);
