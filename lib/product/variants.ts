import { z } from 'zod';

/** Turkce karakterleri de dogru ceviren slug uretici. */
export function slugify(input: string): string {
  const map: Record<string, string> = {
    ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', İ: 'i',
    ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u',
  };
  return input
    .replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => map[c] ?? c)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** "AHS-KEDI-30X40" gibi okunabilir ve benzersiz bir SKU uretir. */
export function generateSku(title: string, materialId: string, size: string): string {
  const part = (s: string, n: number) =>
    slugify(s).replace(/-/g, '').toUpperCase().slice(0, n) || 'X';
  return [part(materialId, 3), part(title, 6), part(size, 6)].join('-');
}

/** Fiyat girdisini "1499.90" formatina normalize eder. */
export function normalizePrice(input: string): string {
  const cleaned = input.trim().replace(/\s/g, '').replace(',', '.');
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) throw new Error(`Geçersiz fiyat: ${input}`);
  return value.toFixed(2);
}

export const variantInputSchema = z.object({
  id: z.string().optional(),
  size: z.string().min(1, 'Ölçü boş olamaz'),
  sku: z.string().default(''),
  price: z.string().min(1, 'Fiyat boş olamaz'),
  compareAtPrice: z.string().optional().nullable(),
  grams: z.number().int().nonnegative().optional(),
});

export type VariantInput = z.infer<typeof variantInputSchema>;

export const draftUpdateSchema = z.object({
  title: z.string().optional(),
  handle: z.string().optional(),
  description: z.string().optional(),
  collection: z.string().optional(),
  tags: z.string().optional(),
  vendor: z.string().optional(),
  productType: z.string().optional(),
  optionName: z.string().optional(),
  /** Inceleme ekranindaki onayla/reddet dugmesi. */
  approved: z.boolean().optional(),
  variants: z.array(variantInputSchema).optional(),
});

/**
 * Varyasyonlari kaydetmeden once dogrular ve normalize eder:
 * bos SKU'lari uretir, fiyatlari formatlar, ayni olcu/SKU tekrarini engeller.
 */
export function prepareVariants(
  variants: VariantInput[],
  ctx: { title: string; materialId: string },
): Array<{
  size: string;
  sku: string;
  price: string;
  compareAtPrice: string | null;
  grams: number;
  position: number;
}> {
  if (variants.length === 0) throw new Error('En az bir varyasyon gerekli');

  const sizes = new Set<string>();
  const skus = new Set<string>();

  return variants.map((v, index) => {
    const size = v.size.trim();
    const sizeKey = size.toLowerCase();
    if (sizes.has(sizeKey)) throw new Error(`Aynı ölçü birden fazla kez girilmiş: ${size}`);
    sizes.add(sizeKey);

    let sku = v.sku.trim() || generateSku(ctx.title, ctx.materialId, size);
    // Cakisma olursa sonuna sira numarasi ekle.
    if (skus.has(sku.toLowerCase())) sku = `${sku}-${index + 1}`;
    skus.add(sku.toLowerCase());

    const price = normalizePrice(v.price);
    const compareAt = v.compareAtPrice?.trim() ? normalizePrice(v.compareAtPrice) : null;
    if (compareAt && Number(compareAt) <= Number(price)) {
      throw new Error(`"${size}" için karşılaştırma fiyatı satış fiyatından büyük olmalı`);
    }

    return { size, sku, price, compareAtPrice: compareAt, grams: v.grams ?? 0, position: index };
  });
}

export function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t, i, a) => a.indexOf(t) === i);
}

/**
 * Materyalin sabit olcu/fiyat tablosunu varyasyon girdisine cevirir.
 * Toplu akista her Draft varyasyonlarini buradan alir; kullanici inceleme
 * ekraninda uzerine yazabilir.
 */
export function variantsFromSizes(
  sizes: Array<{ size: string; price: string; grams?: number; compareAtPrice?: string }>,
): VariantInput[] {
  return sizes.map((s) => ({
    size: s.size,
    sku: '',
    price: s.price,
    compareAtPrice: s.compareAtPrice ?? null,
    grams: s.grams ?? 0,
  }));
}

/**
 * Basliktan Shopify handle'i uretir; ayni handle daha once kullanildiysa
 * sonuna -2, -3 ... ekler. `taken` cagiran tarafindan tasinir (CSV export ve
 * toplu urun olusturma ayni handle'i iki kez uretmesin).
 */
export function buildHandle(title: string, taken: Set<string> = new Set()): string {
  const base = slugify(title) || 'urun';
  let handle = base;
  let n = 2;
  while (taken.has(handle)) handle = `${base}-${n++}`;
  taken.add(handle);
  return handle;
}
