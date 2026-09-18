import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { publishDraft } from '@/lib/shopify/publish';
import { REQUEST_BUDGET_MS } from '@/lib/runtime';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

const bodySchema = z
  .object({
    /** DRAFT: magazada taslak olarak olusur (varsayilan). ACTIVE: dogrudan yayinlanir. */
    status: z.enum(['DRAFT', 'ACTIVE']).default('DRAFT'),
    onlyApproved: z.boolean().default(true),
    /**
     * Onceki parcalarda basarisiz olan taslaklar; tekrar denenmez. Istemci
     * `remaining` 0 olana kadar istegi bu listeyle tekrarlar.
     */
    exclude: z.array(z.string()).default([]),
  })
  .default({});

/**
 * Onaylanan urunleri Shopify'a dogrudan gonderir.
 *
 * Urunler tek tek olusturulur (Admin API hiz limitleri icin) ve bir urun
 * basarisiz olsa da digerleri denenir; sonuc raporu her urun icin doner.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    const body = bodySchema.parse(await req.json().catch(() => ({})));

    const drafts = await prisma.draft.findMany({
      where: {
        batchId: id,
        ...(body.onlyApproved ? { approved: true } : {}),
        // Daha once gonderilmis urunler tekrar olusturulmaz.
        shopifyProductId: null,
        ...(body.exclude.length > 0 ? { id: { notIn: body.exclude } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, title: true },
    });

    if (drafts.length === 0) {
      if (body.exclude.length > 0) {
        return NextResponse.json({ total: 0, succeeded: 0, results: [], remaining: 0 });
      }
      return NextResponse.json(
        { error: 'Gönderilecek ürün yok (onaylanmamış veya hepsi zaten gönderilmiş).' },
        { status: 400 },
      );
    }

    // Tek bir urunun gonderimi (gorsel yukleme dahil) 10-20 sn surebiliyor;
    // butce dolunca durulur ve kalanlar bir sonraki istege birakilir.
    const deadline = Date.now() + REQUEST_BUDGET_MS * 0.75;

    const results: Array<{
      draftId: string;
      title: string;
      ok: boolean;
      adminUrl?: string;
      error?: string;
    }> = [];

    let processedCount = 0;
    for (const draft of drafts) {
      if (processedCount > 0 && Date.now() > deadline) break;
      processedCount++;
      try {
        const result = await publishDraft(draft.id, { status: body.status });
        results.push({ draftId: draft.id, title: draft.title, ok: true, adminUrl: result.adminUrl });
      } catch (err) {
        results.push({
          draftId: draft.id,
          title: draft.title,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const succeeded = results.filter((r) => r.ok).length;
    if (succeeded > 0) {
      await prisma.batch.update({ where: { id }, data: { status: 'done' } }).catch(() => undefined);
    }

    return NextResponse.json({
      total: results.length,
      succeeded,
      results,
      remaining: drafts.length - processedCount,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
