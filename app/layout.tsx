import type { Metadata } from 'next';
import Link from 'next/link';
import { QueuePump } from '@/components/QueuePump';
import { SystemStatus } from '@/components/SystemStatus';
import { IS_CLOUD } from '@/lib/runtime';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Mockup → Shopify',
  description: 'Ürün mockup ve Shopify yayınlama sistemi',
};

const NAV = [
  { href: '/', label: 'Panel' },
  { href: '/board', label: 'Toplu üretim' },
  { href: '/templates', label: 'Şablonlar' },
  { href: '/settings', label: 'Ayarlar' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className="min-h-screen">
        {/* Sayfanin ustune sinen yumusak isik; icerigin arkasinda kalir. */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(60%_100%_at_50%_0%,rgba(16,185,129,0.10),transparent_70%)]"
        />

        <header className="sticky top-0 z-20 border-b border-neutral-900/80 bg-neutral-950/80 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 text-[13px] font-bold text-neutral-950">
                M
              </span>
              <span className="text-sm font-semibold tracking-tight">
                Mockup <span className="text-neutral-600">→</span> Shopify
              </span>
            </Link>

            <nav className="hidden items-center gap-1 sm:flex">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-3 py-1.5 text-sm text-neutral-400 transition hover:bg-neutral-900 hover:text-neutral-100"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="ml-auto">
              <SystemStatus />
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-6 py-8">{children}</div>
        <QueuePump />

        <footer className="mx-auto max-w-7xl px-6 pb-10 pt-4 text-xs text-neutral-600">
          {IS_CLOUD
            ? 'Bulut sürümü · perspektif kompozisyon · Shopify Admin API'
            : 'Yerel çalışır · ComfyUI + perspektif kompozisyon · Shopify Admin API'}
        </footer>
      </body>
    </html>
  );
}
