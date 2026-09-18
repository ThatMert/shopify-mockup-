import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { buildCsv, loadCsvDefaults, type CsvProduct } from '@/lib/export/csv';
import { parseTags } from '@/lib/product/variants';
import { publishAssetUrls } from '@/lib/shopify/files';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const bodySchema = z
  .object({
    /** true: sadece onaylanan urunler; false: batch'teki tum urunler. */
    onlyApproved: z.boolean().default(true),
    /** CSV'deki Status sutunu. */
    status: z.enum(['active', 'draft']).default('active'),
  })
  .default({});

/**
 * Adim 4 — Shopify ice aktarma CSV'si.
 *
 * CSV'nin Image Src sutunu herkese acik adres istedigi icin gorseller once
 * Shopify Files'a yuklenir (Asset.publicUrl doldurulur), sonra satirlar kurulur.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    const body = bodySchema.parse(await req.json().catch(() => ({})));

    const batch = await prisma.batch.findUnique({
      where: { id },
      include: {
        drafts: {
          where: body.onlyApproved ? { approved: true } : {},
          orderBy: { createdAt: 'asc' },
          include: {
            variants: { orderBy: { position: 'asc' } },
            assets: { where: { kind: 'mockup', selected: true }, orderBy: { position: 'asc' } },
          },
        },
      },
    });
    if (!batch) return NextResponse.json({ error: 'Batch bulunamadı' }, { status: 404 });

    if (batch.drafts.length === 0) {
      return NextResponse.json(
        {
          error: body.onlyApproved
            ? 'Onaylanmış ürün yok. İnceleme ekranından en az bir ürünü onaylayın.'
            : 'Bu batch içinde ürün yok.',
        },
        { status: 400 },
      );
    }

    const defaults = await loadCsvDefaults();
    const products: CsvProduct[] = [];

    for (const draft of batch.drafts) {
      if (draft.assets.length === 0) {
        throw new Error(`"${draft.title}" için seçili görsel yok`);
      }
      // Gorselleri Shopify Files'a yukle; CDN adresleri Asset.publicUrl'e yazilir.
      const imageUrls = await publishAssetUrls(draft.id);

      products.push({
        handle: draft.handle,
        title: draft.title,
        description: draft.description,
        vendor: draft.vendor,
        productType: draft.productType,
        tags: parseTags(draft.tags),
        optionName: draft.optionName || 'Ölçü',
        variants: draft.variants.map((v) => ({
          size: v.size,
          sku: v.sku,
          price: v.price,
          compareAtPrice: v.compareAtPrice,
          grams: v.grams,
        })),
        imageUrls,
      });
    }

    const csv = buildCsv(products, { ...defaults, status: body.status });
    const filename = `mockup-${batch.boardName ? batch.boardName.replace(/[^\w-]+/g, '-') : id}.csv`;

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
