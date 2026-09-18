import { NextResponse } from 'next/server';
import { refreshAccessToken } from '@/lib/shopify/client';
import { checkShopify } from '@/lib/shopify/publish';

export const dynamic = 'force-dynamic';

/**
 * Kayitli ayarlarla magazaya baglanmayi dener.
 * Token her seferinde tazelenir; boylece Dev Dashboard'da yeni yayinlanan
 * izinler sunucuyu yeniden baslatmadan gorunur.
 */
export async function POST() {
  refreshAccessToken();
  return NextResponse.json(await checkShopify());
}
