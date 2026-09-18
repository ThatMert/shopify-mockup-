import { z } from 'zod';

/**
 * Bir mockup sablonunda tasarimin nereye ve nasil oturacagini tanimlar.
 * Sablon gorseliyle birlikte yasar: storage/templates/<materyal>/<ad>.placement.json
 */

export const pointSchema = z.object({
  /** Sablon genisligine gore 0-1 normalize. */
  x: z.number(),
  /** Sablon yuksekligine gore 0-1 normalize. */
  y: z.number(),
});

export const placementSchema = z.object({
  /** Urun yuzeyinin dort kosesi: sol-ust, sag-ust, sag-alt, sol-alt sirasiyla. */
  corners: z.tuple([pointSchema, pointSchema, pointSchema, pointSchema]),

  /**
   * Sablonun kendi dokusunun ve isiginin tasarima ne kadar isleyecegi.
   * 0 = duz yapistirma (sticker gibi), 1 = tamamen malzemenin isigina uy.
   */
  textureStrength: z.number().min(0).max(1).default(0.65),

  /** Sablondaki parlak noktalarin (yansima/gloss) tasarimin ustune eklenmesi. */
  glossStrength: z.number().min(0).max(1).default(0.25),

  /** Parlaklik esigi: bu degerin ustundeki luminans yansima sayilir. */
  glossThreshold: z.number().min(0).max(1).default(0.75),

  /** Tasarimin genel opakligi; cam/plexi icin 1'in altina indirilebilir. */
  opacity: z.number().min(0).max(1).default(1),

  /** Kenarlarda yumusatma (piksel). Sert kesim izini gizler. */
  feather: z.number().min(0).max(64).default(1.5),

  /**
   * Ayni islerin ComfyUI blend node'lariyla anlatimindaki karsiliklari.
   * Verilirse yukaridaki degerleri ezer; verilmezse yukaridakiler kullanilir.
   *
   *  multiplyOpacity -> textureStrength (sablonun golge/isik deseninin gucu)
   *  screenOpacity   -> glossStrength   (cam/pleksi yansimasinin gucu)
   */
  multiplyOpacity: z.number().min(0).max(1).optional(),
  screenOpacity: z.number().min(0).max(1).optional(),
});

export type Placement = z.infer<typeof placementSchema>;
export type PlacementPoint = z.infer<typeof pointSchema>;

/** Sablonun tamamini kaplayan varsayilan yerlesim. */
export const DEFAULT_PLACEMENT: Placement = {
  corners: [
    { x: 0.15, y: 0.15 },
    { x: 0.85, y: 0.15 },
    { x: 0.85, y: 0.85 },
    { x: 0.15, y: 0.85 },
  ],
  textureStrength: 0.65,
  glossStrength: 0.25,
  glossThreshold: 0.75,
  opacity: 1,
  feather: 1.5,
};

/** Sablon gorselinin adindan yerlesim dosyasinin adini turetir. */
export function placementFileFor(templateFile: string): string {
  return `${templateFile.replace(/\.[^.]+$/, '')}.placement.json`;
}
