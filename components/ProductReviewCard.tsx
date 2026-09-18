'use client';

import { useEffect, useState } from 'react';
import type { DraftDTO, VariantDTO } from '@/lib/types';
import { fileUrl } from '@/lib/types';
import { Button, ErrorBox, Field, Input, ProgressBar, StatusDot, Textarea } from './ui';

interface VariantRow {
  size: string;
  sku: string;
  price: string;
  grams: number;
}

function toRows(variants: VariantDTO[]): VariantRow[] {
  return variants.map((v) => ({ size: v.size, sku: v.sku, price: v.price, grams: v.grams }));
}

/**
 * Adim 4 — tek bir urunun inceleme karti.
 *
 * Basligi ve HTML aciklamayi kullanici duzenler (materyalin sablon metni on
 * dolgu olarak gelir). Olcu/fiyat tablosu materyalin sabit tablosundan gelir;
 * gerekirse ustune yazilabilir. Onaylanan urunler CSV'ye ve Shopify'a gider.
 */
export function ProductReviewCard({
  draft,
  onSaved,
}: {
  draft: DraftDTO;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(draft.title);
  const [description, setDescription] = useState(draft.description);
  const [rows, setRows] = useState<VariantRow[]>(toRows(draft.variants));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Sunucudaki degerler degistiginde (ilk mockup'lar geldiginde) formu tazele —
  // kullanici bir seyi degistirdiyse (dirty) uzerine yazma.
  useEffect(() => {
    if (dirty) return;
    setTitle(draft.title);
    setDescription(draft.description);
    setRows(toRows(draft.variants));
  }, [draft.title, draft.description, draft.variants, dirty]);

  const mockups = draft.assets.filter((a) => a.kind === 'mockup');
  const activeJobs = draft.jobs.filter((j) => j.status === 'queued' || j.status === 'running');
  const failedJobs = draft.jobs.filter((j) => j.status === 'failed');
  const warnings = draft.jobs.map((j) => j.warning).filter(Boolean) as string[];
  const selectedCount = mockups.filter((a) => a.selected).length;

  async function save(patch: Record<string, unknown> = {}): Promise<boolean> {
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`/api/drafts/${draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          variants: rows.map((r) => ({
            size: r.size,
            sku: r.sku,
            price: r.price,
            grams: r.grams,
          })),
          ...patch,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setDirty(false);
      onSaved();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function toggleAsset(assetId: string, selected: boolean) {
    await fetch(`/api/assets/${assetId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selected }),
    });
    onSaved();
  }

  function update(index: number, patch: Partial<VariantRow>) {
    setDirty(true);
    setRows(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  return (
    <section
      className={`rounded-lg border p-4 transition ${
        draft.approved ? 'border-emerald-600/70 bg-emerald-950/10' : 'border-neutral-800 bg-neutral-900/40'
      }`}
    >
      <header className="mb-3 flex flex-wrap items-center gap-3">
        <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">
          {draft.productType || draft.materialId}
        </span>
        {draft.sourceUrl && (
          <a
            href={draft.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-neutral-500 underline hover:text-neutral-300"
          >
            kaynak pin →
          </a>
        )}
        <span className="text-xs text-neutral-600">/{draft.handle}</span>
        {draft.shopifyProductId && (
          <span className="text-xs text-emerald-400">Shopify&apos;a gönderildi</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant={draft.approved ? 'ghost' : 'primary'}
            disabled={busy || mockups.length === 0}
            onClick={() => void save({ approved: !draft.approved })}
          >
            {draft.approved ? 'Onayı kaldır' : 'Onayla'}
          </Button>
          <Button type="button" variant="ghost" disabled={busy || !dirty} onClick={() => void save()}>
            {busy ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div>
          {activeJobs.length > 0 && (
            <div className="mb-3 space-y-1.5">
              {activeJobs.map((job) => (
                <div key={job.id} className="flex items-center gap-2">
                  <StatusDot status={job.status} />
                  <span className="w-20 shrink-0 truncate text-[11px] text-neutral-500">
                    {job.templateId}
                  </span>
                  <ProgressBar
                    value={job.status === 'running' ? job.progress : 0}
                    label={job.status === 'running' ? `%${job.progress}` : 'sırada'}
                  />
                </div>
              ))}
            </div>
          )}

          {mockups.length === 0 ? (
            <p className="rounded-md border border-dashed border-neutral-800 px-3 py-8 text-center text-xs text-neutral-600">
              Mockup bekleniyor…
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                {mockups.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => void toggleAsset(asset.id, !asset.selected)}
                    title={asset.selected ? 'Seçili — çıkarmak için tıklayın' : 'Seçmek için tıklayın'}
                    className={`overflow-hidden rounded border transition ${
                      asset.selected ? 'border-emerald-500' : 'border-neutral-800 opacity-50'
                    }`}
                  >
                    <div className="aspect-square bg-neutral-950">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={fileUrl(asset.path, undefined, 640)}
                        alt="mockup"
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-neutral-600">
                {selectedCount}/{mockups.length} görsel seçili — ilk görsel ürünün ana görseli olur.
              </p>
            </>
          )}

          {failedJobs.length > 0 && (
            <ul className="mt-2 space-y-1 text-[11px] text-red-400">
              {failedJobs.map((job) => (
                <li key={job.id}>
                  {job.templateId}: {job.error}
                </li>
              ))}
            </ul>
          )}
          {warnings.length > 0 && (
            <ul className="mt-2 space-y-1 text-[11px] text-amber-400">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3">
          <Field label="Başlık">
            <Input
              value={title}
              onChange={(e) => {
                setDirty(true);
                setTitle(e.target.value);
              }}
              placeholder="Ürün başlığı"
            />
          </Field>

          <Field label="Açıklama (HTML)" hint="Materyalin şablon metni ön dolgu olarak gelir.">
            <Textarea
              rows={7}
              value={description}
              onChange={(e) => {
                setDirty(true);
                setDescription(e.target.value);
              }}
              className="font-mono text-xs"
            />
          </Field>

          <div>
            <p className="mb-1 text-xs font-medium text-neutral-400">
              Ölçü ve fiyatlar ({draft.optionName})
            </p>
            <table className="w-full text-xs">
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    <td className="py-0.5 pr-2">
                      <Input
                        value={row.size}
                        onChange={(e) => update(i, { size: e.target.value })}
                        className="px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="w-28 py-0.5 pr-2">
                      <Input
                        value={row.price}
                        onChange={(e) => update(i, { price: e.target.value })}
                        inputMode="decimal"
                        className="px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="w-16 py-0.5 text-neutral-600">₺</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ErrorBox>{error}</ErrorBox>
        </div>
      </div>
    </section>
  );
}
