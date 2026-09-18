import Link from 'next/link';
import { TemplateManager } from '@/components/TemplateManager';

export const dynamic = 'force-dynamic';

export default function TemplatesPage() {
  return (
    <main className="space-y-6">
      <nav className="text-xs text-neutral-500">
        <Link href="/" className="hover:text-neutral-300">
          ← Taslaklar
        </Link>
      </nav>
      <div>
        <h2 className="text-base font-medium text-neutral-100">Mockup şablonları</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Her materyal için boş ürün fotoğraflarını yükleyin. Bir karta tıklayarak
          görseli değiştirebilir, sürükleyip bırakarak da yükleyebilirsiniz.
        </p>
      </div>
      <TemplateManager />
    </main>
  );
}
