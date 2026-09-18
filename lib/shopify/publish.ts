import 'server-only';
import { prisma } from '@/lib/db';
import { parseTags } from '@/lib/product/variants';
import { getShopifyConfig, getTokenScopes, shopifyGraphQL, throwUserErrors } from './client';
import { stageAndUpload } from './files';
import {
  ADD_TO_COLLECTION,
  CREATE_COLLECTION,
  CREATE_PRODUCT,
  FIND_COLLECTION,
  SHOP_INFO,
} from './queries';

type UserError = { field?: string[] | null; message: string; code?: string };

/** Magaza baglantisini, token'i ve izinleri dogrular. */
export async function checkShopify(): Promise<{
  ok: boolean;
  detail: string;
  scopes?: string[];
  eksikIzinler?: string[];
}> {
  try {
    const data = await shopifyGraphQL<{
      shop: { name: string; myshopifyDomain: string; currencyCode: string };
    }>(SHOP_INFO);

    const { granted, missing } = await getTokenScopes();

    return {
      ok: missing.length === 0,
      detail:
        missing.length === 0
          ? `${data.shop.name} (${data.shop.currencyCode})`
          : `${data.shop.name} — eksik izin: ${missing.join(', ')}. ` +
            "Dev Dashboard'da bu izinleri ekleyip UYGULAMANIN YENİ SÜRÜMÜNÜ YAYINLAYIN, " +
            'sonra Ayarlar sayfasında "Bağlantıyı test et"e basın (izinler token üretilirken işleniyor).',
      scopes: granted,
      eksikIzinler: missing,
    };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

/** Koleksiyonu basligina gore bulur, yoksa olusturur. */
async function resolveCollectionId(title: string): Promise<string> {
  const escaped = title.replace(/["\\]/g, (m) => `\\${m}`);
  const found = await shopifyGraphQL<{
    collections: { nodes: Array<{ id: string; title: string }> };
  }>(FIND_COLLECTION, { query: `title:"${escaped}"` });

  const exact = found.collections.nodes.find((c) => c.title.toLowerCase() === title.toLowerCase());
  if (exact) return exact.id;

  const created = await shopifyGraphQL<{
    collectionCreate: { collection: { id: string } | null; userErrors: UserError[] };
  }>(CREATE_COLLECTION, { input: { title } });
  throwUserErrors(created.collectionCreate.userErrors, 'Koleksiyon oluşturulamadı');
  if (!created.collectionCreate.collection) throw new Error('Koleksiyon oluşturulamadı');
  return created.collectionCreate.collection.id;
}

export interface PublishResult {
  productId: string;
  handle: string;
  adminUrl: string;
  variantCount: number;
  mediaCount: number;
}

/**
 * Bir taslagi Shopify'a gonderir: secili mockup'lari yukler, urunu
 * tek option + N varyasyon ile olusturur (her varyasyonun kendi SKU ve
 * FIYATI ile) ve istenen koleksiyona ekler.
 */
export interface PublishOptions {
  /**
   * Urun magazada hangi durumda olusacak.
   * Varsayilan DRAFT: once kontrol edilip elle yayinlanmasi guvenlidir.
   */
  status?: 'DRAFT' | 'ACTIVE';
}

export async function publishDraft(
  draftId: string,
  options: PublishOptions = {},
): Promise<PublishResult> {
  const draft = await prisma.draft.findUnique({
    where: { id: draftId },
    include: {
      variants: { orderBy: { position: 'asc' } },
      assets: { where: { selected: true }, orderBy: { position: 'asc' } },
    },
  });
  if (!draft) throw new Error('Taslak bulunamadı');
  if (!draft.title.trim()) throw new Error('Ürün adı boş olamaz');
  if (draft.variants.length === 0) throw new Error('En az bir varyasyon gerekli');
  if (draft.assets.length === 0) throw new Error('En az bir görsel seçili olmalı');

  await prisma.draft.update({
    where: { id: draftId },
    data: { status: 'publishing', error: null },
  });

  try {
    const files = await stageAndUpload(draft.assets, draft.title);

    const optionName = draft.optionName.trim() || 'Ölçü';
    const input = {
      title: draft.title.trim(),
      ...(draft.handle.trim() ? { handle: draft.handle.trim() } : {}),
      descriptionHtml: draft.description,
      ...(draft.vendor.trim() ? { vendor: draft.vendor.trim() } : {}),
      ...(draft.productType.trim() ? { productType: draft.productType.trim() } : {}),
      tags: parseTags(draft.tags),
      // Varsayilan DRAFT; kullanici "direkt yayinla" secerse ACTIVE gonderilir.
      status: options.status ?? 'DRAFT',
      files: files.map((f) => ({
        originalSource: f.originalSource,
        contentType: 'IMAGE',
        alt: f.alt,
        filename: f.filename,
      })),
      productOptions: [
        {
          name: optionName,
          values: draft.variants.map((v) => ({ name: v.size })),
        },
      ],
      variants: draft.variants.map((v) => ({
        optionValues: [{ optionName, name: v.size }],
        sku: v.sku,
        price: v.price,
        ...(v.compareAtPrice ? { compareAtPrice: v.compareAtPrice } : {}),
      })),
    };

    const result = await shopifyGraphQL<{
      productSet: {
        product: {
          id: string;
          handle: string;
          media: { nodes: unknown[] };
          variants: { nodes: unknown[] };
        } | null;
        userErrors: UserError[];
      };
    }>(CREATE_PRODUCT, { input });

    throwUserErrors(result.productSet.userErrors, 'Ürün oluşturulamadı');
    const product = result.productSet.product;
    if (!product) throw new Error('Shopify ürün döndürmedi');

    if (draft.collection.trim()) {
      const collectionId = await resolveCollectionId(draft.collection.trim());
      const added = await shopifyGraphQL<{
        collectionAddProducts: { userErrors: UserError[] };
      }>(ADD_TO_COLLECTION, { id: collectionId, productIds: [product.id] });
      throwUserErrors(added.collectionAddProducts.userErrors, 'Koleksiyona eklenemedi');
    }

    const numericId = product.id.split('/').pop();
    const adminUrl = `https://${(await getShopifyConfig()).domain}/admin/products/${numericId}`;

    await prisma.draft.update({
      where: { id: draftId },
      data: {
        status: 'published',
        shopifyProductId: product.id,
        publishedAt: new Date(),
        error: null,
      },
    });

    return {
      productId: product.id,
      handle: product.handle,
      adminUrl,
      variantCount: product.variants.nodes.length,
      mediaCount: product.media.nodes.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.draft.update({
      where: { id: draftId },
      data: { status: 'failed', error: message },
    });
    throw err;
  }
}
