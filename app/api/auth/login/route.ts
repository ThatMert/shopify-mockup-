import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_COOKIE, AUTH_MAX_AGE, authConfig, expectedToken, safeEqual } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** Sifreyi dogrular ve imzali oturum cerezini yazar. */
export async function POST(req: NextRequest) {
  const { password, secret } = authConfig();
  if (!password) {
    return NextResponse.json({ error: 'Şifre koruması tanımlı değil (APP_PASSWORD).' }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { password?: string };
  const given = String(body.password ?? '');

  if (!safeEqual(given, password)) {
    // Kaba kuvvet denemelerini yavaslat.
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ error: 'Şifre hatalı' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, await expectedToken(password, secret), {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.nextUrl.protocol === 'https:',
    path: '/',
    maxAge: AUTH_MAX_AGE,
  });
  return res;
}
