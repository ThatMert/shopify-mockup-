import { NextResponse, type NextRequest } from 'next/server';
import { refreshAccessToken } from '@/lib/shopify/client';
import {
  clearShopifySettings,
  getShopifySettingsPublic,
  saveInputSchema,
  saveShopifySettings,
} from '@/lib/settings/shopify';

export const dynamic = 'force-dynamic';

/** Kayitli ayarlar; gizli alanlar yalnizca maskeli doner. */
export async function GET() {
  return NextResponse.json({ settings: await getShopifySettingsPublic() });
}

/** Ayarlari kaydeder. Bos gelen gizli alanlar mevcut degeri korur. */
export async function PUT(req: NextRequest) {
  try {
    const input = saveInputSchema.parse(await req.json());
    await saveShopifySettings(input);
    // Farkli magaza/uygulama icin eski token kullanilmasin.
    refreshAccessToken();
    return NextResponse.json({ settings: await getShopifySettingsPublic() });
  } catch (err) {
    const message =
      err && typeof err === 'object' && 'issues' in err
        ? (err as { issues: Array<{ message: string }> }).issues.map((i) => i.message).join(', ')
        : err instanceof Error
          ? err.message
          : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** Kayitli ayarlari siler; varsa .env degerlerine donulur. */
export async function DELETE() {
  await clearShopifySettings();
  refreshAccessToken();
  return NextResponse.json({ settings: await getShopifySettingsPublic() });
}
