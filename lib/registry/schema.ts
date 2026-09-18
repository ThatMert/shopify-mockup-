import { z } from 'zod';
import type { Placement } from '@/lib/mockup/placement';

/**
 * Bir acinin nasil uretilecegi:
 *  - composite:            perspektif kompozisyon (aninda, tasarim piksel piksel korunur)
 *  - composite+harmonize:  kompozisyon + dusuk denoise FLUX rotus pasi (kenar/renk uyumu)
 *  - comfy:                bastan sona ComfyUI workflow'u (yavas, ama ortam/sahne uretebilir)
 *  - auto:                 yerlesim tanimliysa composite, degilse comfy
 */
export const methodSchema = z.enum(['auto', 'composite', 'composite+harmonize', 'comfy']);
export type Method = z.infer<typeof methodSchema>;
export type ResolvedMethod = Exclude<Method, 'auto'>;

/** Bir materyalin tek bir mockup acisi/sablonu. */
export const templateSchema = z.object({
  /** Dosya adindan turetilebilen benzersiz kimlik, orn. "front". */
  id: z.string().min(1),
  label: z.string().min(1),
  /** storage/templates/<materialId>/ altindaki dosya adi. */
  file: z.string().min(1),
  method: methodSchema.default('auto'),
  /** Bu aciya ozel prompt eki; bos ise sadece materyalin basePrompt'u kullanilir. */
  prompt: z.string().default(''),
  /** Materyalin defaults'unu bu sablon icin ezmek istersen. */
  overrides: z
    .object({
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
      steps: z.number().int().positive().optional(),
      cfg: z.number().positive().optional(),
      sampler: z.string().optional(),
      scheduler: z.string().optional(),
      shift: z.number().optional(),
      negativePrompt: z.string().optional(),
    })
    .default({}),
});

export const materialDefaultsSchema = z.object({
  width: z.number().int().positive().default(1024),
  height: z.number().int().positive().default(1024),
  steps: z.number().int().positive().default(25),
  cfg: z.number().positive().default(3.5),
  sampler: z.string().default('dpmpp_2m'),
  scheduler: z.string().default('simple'),
  shift: z.number().default(3.16),
  negativePrompt: z.string().default(''),
});

/**
 * Kompozisyon sonrasi calisan dusuk denoise FLUX rotus pasinin ayarlari.
 * Sadece method "composite+harmonize" iken kullanilir.
 */
export const harmonizeSchema = z.object({
  workflow: z.string().default('harmonize_flux.json'),
  /** 0.15-0.35 arasi onerilir; yukarisi kompozisyonu bozmaya baslar. */
  denoise: z.number().min(0.05).max(0.6).default(0.25),
  steps: z.number().int().positive().default(20),
  guidance: z.number().positive().default(2.5),
  prompt: z
    .string()
    .default(
      'blend the artwork seamlessly into the product surface, soften the seams, natural lighting and material texture, photorealistic product photo',
    ),
});

/** Bir olcu/fiyat satiri: materyalin sabit varyasyon tablosu. */
export const sizeSchema = z.object({
  /** Option1 Value olarak kullanilir, orn. "30cm x 45cm". */
  size: z.string().min(1),
  /** "1999.00" formatinda; ondalik hassasiyet icin string. */
  price: z.string().min(1),
  /** Shopify CSV'sindeki Variant Grams sutunu. */
  grams: z.number().int().nonnegative().default(0),
  compareAtPrice: z.string().optional(),
});

export type Size = z.infer<typeof sizeSchema>;

export const materialSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/, 'id sadece küçük harf, rakam, - ve _ içerebilir'),
  label: z.string().min(1),
  enabled: z.boolean().default(true),
  /** workflows/ altindaki API-format dosya adi. */
  workflow: z.string().default('flux_kontext_mockup.json'),
  /**
   * Bu materyaldeki acilarin varsayilan uretim yontemi.
   * Sablon kendi method'unda "auto" birakirsa bu deger kullanilir.
   */
  defaultMethod: methodSchema.default('auto'),
  /**
   * Yuzey yansitici mi (cam, pleksi, metal). Yansimasiz materyallerde
   * kompozisyonun "screen" katkisi zorla kapatilir.
   */
  reflective: z.boolean().default(false),
  /** Shopify urun tipine/etiketine yansiyabilecek serbest metin. */
  shopifyTag: z.string().default(''),

  // --- Urun bilgileri: inceleme ekraninin on dolgusu ve CSV sutunlari
  vendor: z.string().default(''),
  productType: z.string().default(''),
  productCategory: z.string().default(''),
  tags: z.array(z.string()).default([]),
  optionName: z.string().default('Ölçü'),
  /** Baslik on dolgusu; {{title}} pin notuyla degistirilir. */
  titleTemplate: z.string().default(''),
  /** Aciklama (HTML) on dolgusu. */
  bodyTemplate: z.string().default(''),
  /** Sabit varyasyon/fiyat tablosu. */
  sizes: z.array(sizeSchema).default([]),

  /** Tum sablonlarin basina eklenen ortak talimat. */
  basePrompt: z.string().min(1),
  defaults: materialDefaultsSchema.default({}),
  harmonize: harmonizeSchema.default({}),
  templates: z.array(templateSchema).default([]),
});

export type MaterialTemplate = z.infer<typeof templateSchema>;
export type MaterialDefaults = z.infer<typeof materialDefaultsSchema>;
export type Harmonize = z.infer<typeof harmonizeSchema>;
export type Material = z.infer<typeof materialSchema>;

/** Sablon + dosyanin diskte gercekten var olup olmadigi bilgisi. */
export type ResolvedTemplate = MaterialTemplate & {
  materialId: string;
  /** Proje-goreli yol, orn. "storage/templates/wood/front.png". */
  path: string;
  exists: boolean;
  /** Dosyanin son degisme zamani (ms). Tarayici cache'ini kirmak icin. */
  mtime: number;
  /** JSON'da tanimli degil, klasore atilmis dosyadan turetildi. */
  autoDiscovered: boolean;
  /** Yaninda duran .placement.json'dan okundu; yoksa null. */
  placement: Placement | null;
  /** method "auto" ise cozulmus hali. */
  resolvedMethod: ResolvedMethod;
};

export type ResolvedMaterial = Omit<Material, 'templates'> & {
  templates: ResolvedTemplate[];
};
