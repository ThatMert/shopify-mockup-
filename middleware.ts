import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_COOKIE, authConfig, expectedToken, readEnv, safeEqual } from '@/lib/auth';

/**
 * Tum sayfa ve API isteklerini sifre korumasindan gecirir.
 *
 * - APP_PASSWORD tanimli degilse ve yerelde calisiyorsa: koruma yok (eski davranis).
 * - Bulutta APP_PASSWORD tanimli degilse: site hic acilmaz; yanlislikla korumasiz
 *   yayina cikmayi onler.
 */
export async function middleware(req: NextRequest) {
  const { password, secret, required } = authConfig();
  if (!required) return NextResponse.next();

  const isApi = req.nextUrl.pathname.startsWith('/api/');

  if (!password) {
    const message =
      'Bu site şifre ile korunmalı: Netlify ortam değişkenlerine APP_PASSWORD (ve APP_SECRET) ekleyip yeniden yayınlayın.';
    return isApi
      ? NextResponse.json({ error: message }, { status: 503 })
      : new NextResponse(message, { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }

  // Yerelden toplu aktarim (scripts/push-templates.mjs): tek seferlik IMPORT_TOKEN
  // ile yalnizca /api/admin/* uclarina erisilir. Aktarim bitince token silinmeli.
  const importToken = readEnv('IMPORT_TOKEN')?.trim();
  if (importToken && req.nextUrl.pathname.startsWith('/api/admin/')) {
    const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    if (bearer && safeEqual(bearer, importToken)) return NextResponse.next();
  }

  const cookie = req.cookies.get(AUTH_COOKIE)?.value ?? '';
  if (cookie && safeEqual(cookie, await expectedToken(password, secret))) {
    return NextResponse.next();
  }

  if (isApi) {
    return NextResponse.json({ error: 'Oturum açmanız gerekiyor' }, { status: 401 });
  }

  const login = req.nextUrl.clone();
  login.pathname = '/login';
  login.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(login);
}

export const config = {
  // Giris sayfasi, giris API'si ve statik dosyalar korumadan muaf.
  matcher: ['/((?!login|api/auth/|_next/static|_next/image|favicon.ico).*)'],
};
