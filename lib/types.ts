/** UI ile API arasinda paylasilan tipler (Prisma modellerinin serilestirilmis hali). */

export interface MaterialTemplateDTO {
  id: string;
  label: string;
  /** storage/templates/<materyal>/ altindaki dosya adi. */
  file: string;
  path: string;
  exists: boolean;
  /** Son degisme zamani; gorsel URL'ine eklenerek cache kirilir. */
  mtime: number;
  autoDiscovered: boolean;
  /** Yaninda .placement.json var mi. */
  hasPlacement: boolean;
  /** Bu aci nasil uretilecek. */
  method: 'composite' | 'composite+harmonize' | 'comfy';
}

export interface SizeDTO {
  size: string;
  price: string;
  grams: number;
  compareAtPrice?: string;
}

export interface MaterialDTO {
  id: string;
  label: string;
  shopifyTag: string;
  reflective: boolean;
  vendor: string;
  productType: string;
  tags: string[];
  optionName: string;
  /** Sabit varyasyon/fiyat tablosu; inceleme ekraninda gosterilir. */
  sizes: SizeDTO[];
  templates: MaterialTemplateDTO[];
}

export interface VariantDTO {
  id: string;
  size: string;
  sku: string;
  price: string;
  compareAtPrice: string | null;
  grams: number;
  position: number;
}

export interface JobDTO {
  id: string;
  materialId: string;
  templateId: string;
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  progress: number;
  error: string | null;
  warning: string | null;
}

export interface AssetDTO {
  id: string;
  publicUrl: string | null;
  path: string;
  kind: 'mockup' | 'source' | 'design';
  width: number;
  height: number;
  selected: boolean;
  position: number;
  jobId: string | null;
}

export interface DraftDTO {
  id: string;
  status: string;
  batchId: string | null;
  pinId: string | null;
  materialId: string | null;
  approved: boolean;
  handle: string;
  vendor: string;
  productType: string;
  sourceType: string | null;
  sourceUrl: string | null;
  sourcePath: string | null;
  designPath: string | null;
  title: string;
  description: string;
  collection: string;
  tags: string;
  optionName: string;
  shopifyProductId: string | null;
  error: string | null;
  variants: VariantDTO[];
  jobs: JobDTO[];
  assets: AssetDTO[];
}

/**
 * storage/ altindaki bir dosyanin tarayicida gosterilecek URL'i.
 *
 * Sablon gorselleri ayni yola tekrar tekrar yazildigi icin (sil + yeni yukle)
 * mutlaka `version` gecin — aksi halde tarayici eski gorseli cache'ten servis eder.
 */
export function fileUrl(relPath: string, version?: number | string, width?: number): string {
  const v = version != null && version !== '' ? `&v=${encodeURIComponent(String(version))}` : '';
  // Genislik verilirse sunucu kucultulmus JPEG dondurur (izgaralar/kartlar icin).
  const w = width ? `&w=${width}` : '';
  return `/api/file?path=${encodeURIComponent(relPath)}${v}${w}`;
}

export interface PinDTO {
  id: string;
  pinId: string;
  pinUrl: string;
  thumbUrl: string;
  imageUrl: string;
  note: string;
  selected: boolean;
  position: number;
  error: string | null;
}

export interface BatchDTO {
  id: string;
  boardUrl: string;
  boardName: string;
  source: 'api' | 'scrape';
  status: string;
  pins: PinDTO[];
  drafts: DraftDTO[];
  /** Is sayaclari: toplu ilerleme cubugu bunlardan hesaplanir. */
  counts: {
    total: number;
    queued: number;
    running: number;
    done: number;
    failed: number;
    cancelled: number;
  };
}
