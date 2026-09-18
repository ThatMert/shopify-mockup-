import { NextResponse, type NextRequest } from 'next/server';
import { publishDraft } from '@/lib/shopify/publish';

export const dynamic = 'force-dynamic';
// Gorsel yukleme + urun olusturma birkac dakika surebilir.
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

/**
 * Onaylanan taslagi Shopify'a gonderir.
 * Bu ucu yalnizca kullanici preview ekraninda onay verdiginde cagirin —
 * magazada gercek bir urun olusturur.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const result = await publishDraft(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
