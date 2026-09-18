import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '@/lib/paths';
import { IS_CLOUD } from '@/lib/runtime';
import { BUNDLED_CSV } from '@/lib/registry/bundled.generated';

/**
 * Shopify urun ice aktarma CSV'si.
 *
 * Sutun listesi magazanin kendi export dosyasindan birebir alinmistir; bos
 * birakilan sutunlar (metafield'lar dahil) ice aktarmada yok sayilir ama
 * dosyanin mevcut export'la ayni sekilde acilmasini saglar.
 *
 * Satir duzeni Shopify'in bekledigi sekilde:
 *  - urunun ILK satiri: tum urun bilgileri + ilk varyasyon + ilk gorsel
 *  - sonraki varyasyon satirlari: yalnizca Handle + varyasyon alanlari
 *  - artan gorseller: yalnizca Handle + Image Src + Image Position
 */

export const CSV_COLUMNS = [
  'Handle',
  'Title',
  'Body (HTML)',
  'Vendor',
  'Product Category',
  'Type',
  'Tags',
  'Published',
  'Option1 Name',
  'Option1 Value',
  'Option1 Linked To',
  'Option2 Name',
  'Option2 Value',
  'Option2 Linked To',
  'Option3 Name',
  'Option3 Value',
  'Option3 Linked To',
  'Variant SKU',
  'Variant Grams',
  'Variant Inventory Tracker',
  'Variant Inventory Qty',
  'Variant Inventory Policy',
  'Variant Fulfillment Service',
  'Variant Price',
  'Variant Compare At Price',
  'Variant Requires Shipping',
  'Variant Taxable',
  'Unit Price Total Measure',
  'Unit Price Total Measure Unit',
  'Unit Price Base Measure',
  'Unit Price Base Measure Unit',
  'Variant Barcode',
  'Image Src',
  'Image Position',
  'Image Alt Text',
  'Gift Card',
  'SEO Title',
  'SEO Description',
  'Google Shopping / Google Product Category',
  'Google Shopping / Gender',
  'Google Shopping / Age Group',
  'Google Shopping / MPN',
  'Google Shopping / Condition',
  'Google Shopping / Custom Product',
  'Google Shopping / Custom Label 0',
  'Google Shopping / Custom Label 1',
  'Google Shopping / Custom Label 2',
  'Google Shopping / Custom Label 3',
  'Google Shopping / Custom Label 4',
  'sizechart (product.metafields.custom.sizechart)',
  'Google: Custom Product (product.metafields.mm-google-shopping.custom_product)',
  'Renk (product.metafields.shopify.color-pattern)',
  'Mürekkep formu (product.metafields.shopify.ink-form)',
  'Yaka Çizgisi (product.metafields.shopify.neckline)',
  'Boyut (product.metafields.shopify.size)',
  'Kol Uzunluğu Tipi (product.metafields.shopify.sleeve-length-type)',
  'Variant Image',
  'Variant Weight Unit',
  'Variant Tax Code',
  'Cost per item',
  'Status',
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];
export type CsvRow = Partial<Record<CsvColumn, string>>;

export interface CsvDefaults {
  published: string;
  status: string;
  giftCard: string;
  inventoryTracker: string;
  inventoryQty: number;
  inventoryPolicy: string;
  fulfillmentService: string;
  requiresShipping: string;
  taxable: string;
  weightUnit: string;
  defaultVendor: string;
}

const FALLBACK_DEFAULTS: CsvDefaults = {
  published: 'true',
  status: 'active',
  giftCard: 'false',
  inventoryTracker: 'shopify',
  inventoryQty: 100,
  inventoryPolicy: 'continue',
  fulfillmentService: 'manual',
  requiresShipping: 'true',
  taxable: 'true',
  weightUnit: 'kg',
  defaultVendor: '',
};

/** config/csv.json — sabit sutun degerleri; dosya yoksa makul varsayilanlar. */
export async function loadCsvDefaults(): Promise<CsvDefaults> {
  // Bulutta config dosyalari derleme aninda gomulur (bkz. scripts/bundle-config.mjs).
  if (IS_CLOUD) {
    return { ...FALLBACK_DEFAULTS, ...((BUNDLED_CSV ?? {}) as Partial<CsvDefaults>) };
  }
  try {
    const raw = await fs.readFile(path.join(ROOT, 'config', 'csv.json'), 'utf8');
    return { ...FALLBACK_DEFAULTS, ...(JSON.parse(raw) as Partial<CsvDefaults>) };
  } catch {
    return FALLBACK_DEFAULTS;
  }
}

export interface CsvVariant {
  size: string;
  sku: string;
  price: string;
  compareAtPrice?: string | null;
  grams?: number;
}

export interface CsvProduct {
  handle: string;
  title: string;
  description: string;
  vendor: string;
  productType: string;
  productCategory?: string;
  tags: string[];
  optionName: string;
  variants: CsvVariant[];
  /** Herkese acik gorsel adresleri (Shopify Files CDN), sirasi onemli. */
  imageUrls: string[];
}

/** CSV alani: ayirici, tirnak veya satir sonu varsa tirnak icine alinir. */
function escapeCsv(value: string): string {
  if (value === '') return '';
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function serializeRow(row: CsvRow): string {
  return CSV_COLUMNS.map((col) => escapeCsv(row[col] ?? '')).join(',');
}

/**
 * Tek bir urunun tum CSV satirlarini uretir.
 * Gorseller varyasyon satirlarina dagitilir; artanlar icin ek satir acilir.
 */
export function buildProductRows(product: CsvProduct, defaults: CsvDefaults): CsvRow[] {
  if (product.variants.length === 0) {
    throw new Error(`"${product.title}" için varyasyon yok`);
  }

  const variantRow = (v: CsvVariant, index: number): CsvRow => ({
    Handle: product.handle,
    'Option1 Value': v.size,
    'Variant SKU': v.sku,
    'Variant Grams': String(v.grams ?? 0),
    'Variant Inventory Tracker': defaults.inventoryTracker,
    'Variant Inventory Qty': String(defaults.inventoryQty),
    'Variant Inventory Policy': defaults.inventoryPolicy,
    'Variant Fulfillment Service': defaults.fulfillmentService,
    'Variant Price': v.price,
    ...(v.compareAtPrice ? { 'Variant Compare At Price': v.compareAtPrice } : {}),
    'Variant Requires Shipping': defaults.requiresShipping,
    'Variant Taxable': defaults.taxable,
    'Variant Weight Unit': defaults.weightUnit,
    // Bu satira denk gelen gorsel varsa birlikte tasinir.
    ...(product.imageUrls[index]
      ? {
          'Image Src': product.imageUrls[index],
          'Image Position': String(index + 1),
          'Image Alt Text': product.title,
        }
      : {}),
  });

  const rows: CsvRow[] = [];

  // --- Ilk satir: urun bilgileri + ilk varyasyon + ilk gorsel.
  rows.push({
    ...variantRow(product.variants[0], 0),
    Title: product.title,
    'Body (HTML)': product.description,
    Vendor: product.vendor || defaults.defaultVendor,
    'Product Category': product.productCategory ?? '',
    Type: product.productType,
    Tags: product.tags.join(', '),
    Published: defaults.published,
    'Option1 Name': product.optionName,
    'Gift Card': defaults.giftCard,
    Status: defaults.status,
  });

  // --- Kalan varyasyonlar.
  for (let i = 1; i < product.variants.length; i++) {
    rows.push(variantRow(product.variants[i], i));
  }

  // --- Varyasyon sayisini asan gorseller icin yalniz gorsel satirlari.
  for (let i = product.variants.length; i < product.imageUrls.length; i++) {
    rows.push({
      Handle: product.handle,
      'Image Src': product.imageUrls[i],
      'Image Position': String(i + 1),
      'Image Alt Text': product.title,
    });
  }

  return rows;
}

/**
 * Tam CSV metni. Excel'in UTF-8'i dogru acmasi icin BOM ile baslar,
 * satirlar Shopify'in ornek dosyalarindaki gibi CRLF ile ayrilir.
 */
export function buildCsv(products: CsvProduct[], defaults: CsvDefaults): string {
  const rows = products.flatMap((p) => buildProductRows(p, defaults));
  const lines = [CSV_COLUMNS.map(escapeCsv).join(','), ...rows.map(serializeRow)];
  return `﻿${lines.join('\r\n')}\r\n`;
}
