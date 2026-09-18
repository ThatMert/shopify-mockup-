import { NextResponse } from 'next/server';
import { processQueue } from '@/lib/comfy/queue';

export const dynamic = 'force-dynamic';
// Netlify'da senkron fonksiyonlar 60 sn'de kesilir; processQueue 40 sn'lik
// butceyle calisip kalanini bir sonraki cagriya birakir.
export const maxDuration = 60;

/**
 * Bulut modunda kuyrugu ilerletir. Acik sekmedeki QueuePump bileseni
 * bekleyen is kaldikca bunu arka arkaya cagirir. Yerelde etkisizdir.
 */
export async function POST() {
  try {
    return NextResponse.json(await processQueue());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
