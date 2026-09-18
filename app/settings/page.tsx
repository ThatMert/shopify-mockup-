import { ShopifySettingsForm } from '@/components/ShopifySettingsForm';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  return (
    <main className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-base font-medium text-neutral-100">Ayarlar</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Ürünlerin gönderileceği Shopify mağazasını buradan bağlayın.
        </p>
      </div>
      <ShopifySettingsForm />
    </main>
  );
}
