/**
 * Flux Kontext'in desteklediği çözünürlükler ve kırpmasız uyarlama.
 *
 * ComfyUI'nin `FluxKontextImageScale` node'u gorseli en yakin desteklenen
 * cozunurluge `crop="center"` ile oturtuyor - yani orani tutmayan gorselleri
 * ortadan KIRPIYOR. Mockup uretiminde bu kabul edilemez: sablonun kenarlari
 * veya tasarimin bir kismi kayboluyor.
 *
 * Bunun yerine kirpmadan (crop="disabled") olcekliyoruz. Olusan kucuk oran
 * sapmasi uretim bittikten sonra ciktinin orijinal olculere geri
 * olceklenmesiyle birebir geri alinir.
 */

/** comfy_extras/nodes_flux.py -> PREFERRED_KONTEXT_RESOLUTIONS */
export const KONTEXT_RESOLUTIONS: ReadonlyArray<readonly [number, number]> = [
  [672, 1568],
  [688, 1504],
  [720, 1456],
  [752, 1392],
  [800, 1328],
  [832, 1248],
  [880, 1184],
  [944, 1104],
  [1024, 1024],
  [1104, 944],
  [1184, 880],
  [1248, 832],
  [1328, 800],
  [1392, 752],
  [1456, 720],
  [1504, 688],
  [1568, 672],
] as const;

/** Verilen olcuye en yakin oranli desteklenen cozunurlugu bulur. */
export function nearestKontextResolution(
  width: number,
  height: number,
): { width: number; height: number } {
  const aspect = width / height;
  let best = KONTEXT_RESOLUTIONS[0];
  let bestDelta = Infinity;

  for (const res of KONTEXT_RESOLUTIONS) {
    const delta = Math.abs(aspect - res[0] / res[1]);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = res;
    }
  }

  return { width: best[0], height: best[1] };
}

/**
 * Referans gorselleri icin olcu: oran korunur, uzun kenar sinirlanir ve
 * VAE'nin istedigi gibi 16'nin katina hizalanir. Kirpma yok.
 *
 * Referans gorselin Kontext cozunurluk listesinde olmasi gerekmiyor; sadece
 * cikti olcusunu belirleyen latent icin gerekli.
 */
export function referenceSize(
  width: number,
  height: number,
  maxPixels = 1024 * 1024,
): { width: number; height: number } {
  const scale = Math.min(1, Math.sqrt(maxPixels / (width * height)));
  const align = (v: number) => Math.max(16, Math.round((v * scale) / 16) * 16);
  return { width: align(width), height: align(height) };
}
