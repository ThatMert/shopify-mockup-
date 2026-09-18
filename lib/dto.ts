import type { Asset, Batch, Draft, MockupJob, Pin, Variant } from '@prisma/client';
import type { AssetDTO, BatchDTO, DraftDTO, JobDTO, PinDTO, VariantDTO } from '@/lib/types';

/**
 * Prisma kayitlarini UI'a gidecek sade nesnelere cevirir.
 *
 * Server bilesenlerinden client bilesenine Date alanlari gecemedigi ve API
 * ciktilarinin tek bir sekle sahip olmasi gerektigi icin tum serilestirme
 * burada toplanir.
 */

export type DraftWithRelations = Draft & {
  variants: Variant[];
  jobs: MockupJob[];
  assets: Asset[];
};

export function toVariantDTO(v: Variant): VariantDTO {
  return {
    id: v.id,
    size: v.size,
    sku: v.sku,
    price: v.price,
    compareAtPrice: v.compareAtPrice,
    grams: v.grams,
    position: v.position,
  };
}

export function toJobDTO(j: MockupJob): JobDTO {
  return {
    id: j.id,
    materialId: j.materialId,
    templateId: j.templateId,
    status: j.status as JobDTO['status'],
    progress: j.progress,
    error: j.error,
    warning: j.warning,
  };
}

export function toAssetDTO(a: Asset): AssetDTO {
  return {
    id: a.id,
    path: a.path,
    publicUrl: a.publicUrl,
    kind: a.kind as AssetDTO['kind'],
    width: a.width,
    height: a.height,
    selected: a.selected,
    position: a.position,
    jobId: a.jobId,
  };
}

export function toDraftDTO(draft: DraftWithRelations): DraftDTO {
  return {
    id: draft.id,
    status: draft.status,
    batchId: draft.batchId,
    pinId: draft.pinId,
    materialId: draft.materialId,
    approved: draft.approved,
    sourceType: draft.sourceType,
    sourceUrl: draft.sourceUrl,
    sourcePath: draft.sourcePath,
    designPath: draft.designPath,
    title: draft.title,
    handle: draft.handle,
    description: draft.description,
    collection: draft.collection,
    tags: draft.tags,
    vendor: draft.vendor,
    productType: draft.productType,
    optionName: draft.optionName,
    shopifyProductId: draft.shopifyProductId,
    error: draft.error,
    variants: draft.variants.map(toVariantDTO),
    jobs: draft.jobs.map(toJobDTO),
    assets: draft.assets.map(toAssetDTO),
  };
}

export function toPinDTO(pin: Pin): PinDTO {
  return {
    id: pin.id,
    pinId: pin.pinId,
    pinUrl: pin.pinUrl,
    thumbUrl: pin.thumbUrl,
    imageUrl: pin.imageUrl,
    note: pin.note,
    selected: pin.selected,
    position: pin.position,
    error: pin.error,
  };
}

/** Bir batch'in tum durumu + is sayaclari (ilerleme cubugu bunlardan hesaplanir). */
export function toBatchDTO(
  batch: Batch & { pins: Pin[]; drafts: DraftWithRelations[] },
): BatchDTO {
  const counts = { total: 0, queued: 0, running: 0, done: 0, failed: 0, cancelled: 0 };
  for (const draft of batch.drafts) {
    for (const job of draft.jobs) {
      counts.total++;
      if (job.status in counts) counts[job.status as keyof typeof counts]++;
    }
  }

  return {
    id: batch.id,
    boardUrl: batch.boardUrl,
    boardName: batch.boardName,
    source: batch.source as BatchDTO['source'],
    status: batch.status,
    pins: batch.pins.map(toPinDTO),
    drafts: batch.drafts.map(toDraftDTO),
    counts,
  };
}
