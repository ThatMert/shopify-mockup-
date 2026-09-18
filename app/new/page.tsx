'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, ErrorBox, Field, Input } from '@/components/ui';
import { shrinkImage } from '@/lib/client/shrinkImage';

/** Adim 1 — tasarimin kaynagi: Pinterest pin URL'si veya manuel dosya yukleme. */
export default function NewDraftPage() {
  const router = useRouter();
  const [pinUrl, setPinUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const form = new FormData();
      // Bulutta istek govdesi ~4.5 MB ile sinirli; buyuk dosyalar once kucultulur.
      if (file) form.append('file', await shrinkImage(file));
      else form.append('pinterestUrl', pinUrl);

      const res = await fetch('/api/drafts', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Taslak oluşturulamadı');
      router.push(`/draft/${json.draft.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <main className="max-w-2xl space-y-6">
      <form onSubmit={submit} className="space-y-6">
        <Card
          title="1. Tasarım kaynağı"
          hint="Pinterest pin bağlantısı yapıştırın veya tasarımı doğrudan yükleyin."
        >
          <div className="space-y-4">
            <Field label="Pinterest pin URL" hint="pinterest.com/pin/... veya pin.it/... ">
              <Input
                type="url"
                value={pinUrl}
                onChange={(e) => setPinUrl(e.target.value)}
                placeholder="https://tr.pinterest.com/pin/123456789/"
                disabled={!!file || busy}
              />
            </Field>

            <div className="flex items-center gap-3 text-xs text-neutral-600">
              <span className="h-px flex-1 bg-neutral-800" />
              veya
              <span className="h-px flex-1 bg-neutral-800" />
            </div>

            <Field label="Tasarım dosyası" hint="PNG, JPG veya WEBP. Şeffaf arka plan desteklenir.">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={busy}
                className="w-full cursor-pointer rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-400 file:mr-3 file:rounded file:border-0 file:bg-neutral-800 file:px-3 file:py-1 file:text-neutral-200"
              />
            </Field>

            {file && (
              <button
                type="button"
                onClick={() => setFile(null)}
                className="text-xs text-neutral-500 underline hover:text-neutral-300"
              >
                Dosya seçimini temizle ({file.name})
              </button>
            )}
          </div>
        </Card>

        <ErrorBox>{error}</ErrorBox>

        <Button type="submit" disabled={busy || (!file && !pinUrl.trim())}>
          {busy ? 'Tasarım alınıyor…' : 'Devam et'}
        </Button>
      </form>
    </main>
  );
}
