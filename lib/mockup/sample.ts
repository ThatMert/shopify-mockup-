import 'server-only';
import sharp from 'sharp';
import { storage } from '@/lib/storage';

/**
 * Yerlesim editorunde kullanilan ornek tasarim.
 *
 * Bilerek "zor" bir desen: ince cizgiler, dik acili kenarlik, capraz izgara ve
 * kucuk punto yazi. Koseler yanlis ayarlanmissa carpilma aninda goze carpar.
 */
function sampleSvg(width = 1000, height = 1250): string {
  const grid: string[] = [];
  const step = width / 10;
  for (let i = 1; i < 10; i++) {
    grid.push(`<line x1="${i * step}" y1="0" x2="${i * step}" y2="${height}" />`);
  }
  for (let i = 1; i * step < height; i++) {
    grid.push(`<line x1="0" y1="${i * step}" x2="${width}" y2="${i * step}" />`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <g stroke="#1b1b1b" stroke-width="1.5" opacity="0.35">${grid.join('')}</g>
  <rect x="10" y="10" width="${width - 20}" height="${height - 20}"
        fill="none" stroke="#1b1b1b" stroke-width="8"/>
  <line x1="10" y1="10" x2="${width - 10}" y2="${height - 10}" stroke="#1b1b1b" stroke-width="3"/>
  <line x1="${width - 10}" y1="10" x2="10" y2="${height - 10}" stroke="#1b1b1b" stroke-width="3"/>
  <circle cx="${width / 2}" cy="${height / 2}" r="${width * 0.34}"
          fill="none" stroke="#1b1b1b" stroke-width="8"/>
  <text x="${width / 2}" y="${height * 0.44}" font-family="Georgia,serif" font-size="${width * 0.1}"
        fill="#1b1b1b" text-anchor="middle" letter-spacing="6">ÖRNEK</text>
  <text x="${width / 2}" y="${height * 0.52}" font-family="Georgia,serif" font-size="${width * 0.032}"
        fill="#1b1b1b" text-anchor="middle" letter-spacing="10">YERLESIM KONTROLU</text>
  <text x="${width / 2}" y="${height - 40}" font-family="monospace" font-size="${width * 0.026}"
        fill="#1b1b1b" text-anchor="middle">ALT KENAR</text>
  <text x="${width / 2}" y="60" font-family="monospace" font-size="${width * 0.026}"
        fill="#1b1b1b" text-anchor="middle">UST KENAR</text>
</svg>`;
}

let cached: string | null = null;

/**
 * Ornek tasarimi diske yazar (bir kez) ve proje-goreli yolunu dondurur.
 * Kompozisyon motoru dosya yolu bekledigi icin bellekte tutulmuyor.
 */
export async function ensureSampleDesign(): Promise<string> {
  if (cached) return cached;

  const key = 'storage/processed/__sample-design.png';
  if (!(await storage.stat(key)).exists) {
    const png = await sharp(Buffer.from(sampleSvg())).png().toBuffer();
    await storage.write(key, png);
  }

  cached = key;
  return cached;
}
