'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DraftDTO } from '@/lib/types';
import { fileUrl } from '@/lib/types';
import { MaterialPicker, type Selection } from './MaterialPicker';
import { MockupGrid } from './MockupGrid';
import { VariantTable, toRows, type VariantRow } from './VariantTable';
import { Button, Card, ErrorBox, Field, Input, Textarea } from './ui';

/** Is calisirken durumu bu araliklarla yeniler. */
const POLL_MS = 1500;

export function DraftWorkspace({ initial }: { initial: DraftDTO }) {
  const [draft, setDraft] = useState<DraftDTO>(initial);
  const [rows, setRows] = useState<VariantRow[]>(
    initial.variants.length > 0
      ? toRows(initial.variants)
      : [{ size: '', sku: '', price: '', compareAtPrice: '' }],
  );
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState<{ adminUrl: string; variantCount: number } | null>(null);

  const hasActiveJobs = draft.jobs.some((j) => j.status === 'queued' || j.status === 'running');
  // Polling icinde guncel degeri okuyabilmek icin ref'te de tut.
  const activeRef = useRef(hasActiveJobs);
  activeRef.current = hasActiveJobs;

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/drafts/${initial.id}`);
    if (!res.ok) return;
    const json = await res.json();
    setDraft(json.draft);
  }, [initial.id]);

  // Aktif is varken durumu periyodik olarak cek.
  useEffect(() => {
    if (!hasActiveJobs) return;
    const timer = setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [hasActiveJobs, refresh]);

  async function generate(selections: Selection[]) {
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`/api/drafts/${draft.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selections }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      window.dispatchEvent(new Event('queue:kick'));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function cancelJobs() {
    await fetch(`/api/drafts/${draft.id}/generate`, { method: 'DELETE' });
    await refresh();
  }

  async function toggleAsset(assetId: string, selected: boolean) {
    // Iyimser guncelleme: UI hemen tepki versin.
    setDraft((d) => ({
      ...d,
      assets: d.assets.map((a) => (a.id === assetId ? { ...a, selected } : a)),
    }));
    await fetch(`/api/assets/${assetId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selected }),
    });
  }

  async function deleteAsset(assetId: string) {
    setDraft((d) => ({ ...d, assets: d.assets.filter((a) => a.id !== assetId) }));
    await fetch(`/api/assets/${assetId}`, { method: 'DELETE' });
  }

  async function save(): Promise<boolean> {
    setError('');
    setNotice('');
    const res = await fetch(`/api/drafts/${draft.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: draft.title,
        description: draft.description,
        collection: draft.collection,
        tags: draft.tags,
        optionName: draft.optionName,
        variants: rows.map((r) => ({
          size: r.size,
          sku: r.sku,
          price: r.price,
          compareAtPrice: r.compareAtPrice || null,
        })),
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error);
      return false;
    }
    setDraft((d) => ({ ...d, ...json.draft }));
    setRows(toRows(json.draft.variants));
    return true;
  }

  async function saveOnly() {
    setBusy(true);
    if (await save()) setNotice('Taslak kaydedildi.');
    setBusy(false);
  }

  async function publish() {
    setPublishing(true);
    setError('');
    setNotice('');
    try {
      // Once formdaki son hali kaydet ki Shopify'a gonderilen veri ekrandakiyle bire bir olsun.
      if (!(await save())) return;

      const res = await fetch(`/api/drafts/${draft.id}/publish`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setPublished({ adminUrl: json.adminUrl, variantCount: json.variantCount });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
    }
  }

  const selectedMockups = draft.assets.filter((a) => a.kind === 'mockup' && a.selected);
  const canPublish =
    !publishing &&
    !hasActiveJobs &&
    draft.title.trim().length > 0 &&
    selectedMockups.length > 0 &&
    rows.some((r) => r.size.trim() && r.price.trim());

  return (
    <div className="space-y-6">
      {/* Kaynak tasarim onizlemesi */}
      {draft.designPath && (
        <Card title="Tasarım" hint={draft.sourceUrl ?? 'manuel yükleme'}>
          <div className="flex items-start gap-4">
            <div className="h-32 w-32 shrink-0 overflow-hidden rounded-md border border-neutral-800 bg-neutral-950">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fileUrl(draft.designPath, undefined, 320)}
                alt="tasarım"
                className="h-full w-full object-contain"
              />
            </div>
            <p className="text-xs text-neutral-500">
              Bu görsel kırpılıp normalize edildi ve her mockup işine referans olarak verilecek.
            </p>
          </div>
        </Card>
      )}

      <MaterialPicker onGenerate={generate} busy={busy || hasActiveJobs} />

      <MockupGrid
        jobs={draft.jobs}
        assets={draft.assets}
        onToggle={toggleAsset}
        onDelete={deleteAsset}
        onCancel={cancelJobs}
        disabled={publishing}
      />

      <Card title="4. Ürün bilgileri" hint="Shopify'da görünecek alanlar.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Ürün adı *">
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Soyut Geometrik Duvar Tablosu"
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Açıklama" hint="HTML kullanabilirsiniz.">
              <Textarea
                rows={4}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Koleksiyon" hint="Yoksa Shopify'da otomatik oluşturulur.">
            <Input
              value={draft.collection}
              onChange={(e) => setDraft({ ...draft, collection: e.target.value })}
              placeholder="Duvar Dekorasyonu"
            />
          </Field>
          <Field label="Etiketler" hint="Virgülle ayırın.">
            <Input
              value={draft.tags}
              onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
              placeholder="ahşap, modern, hediyelik"
            />
          </Field>
          <Field label="Varyasyon seçeneği adı" hint="Shopify'da option başlığı olur.">
            <Input
              value={draft.optionName}
              onChange={(e) => setDraft({ ...draft, optionName: e.target.value })}
              placeholder="Ölçü"
            />
          </Field>
        </div>
      </Card>

      <VariantTable rows={rows} onChange={setRows} disabled={publishing} />

      {/* Onay ve yayinlama */}
      <Card
        title="5. Önizleme ve Shopify'a gönder"
        hint="Ürün mağazada TASLAK (draft) olarak oluşturulur; kontrol edip kendiniz yayınlarsınız."
      >
        <dl className="mb-5 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-neutral-500">Görsel</dt>
            <dd className="text-neutral-200">{selectedMockups.length} seçili</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500">Varyasyon</dt>
            <dd className="text-neutral-200">{rows.filter((r) => r.size.trim()).length}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500">Fiyat aralığı</dt>
            <dd className="text-neutral-200">{priceRange(rows)}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500">Koleksiyon</dt>
            <dd className="truncate text-neutral-200">{draft.collection || '—'}</dd>
          </div>
        </dl>

        <ErrorBox>{error}</ErrorBox>
        {notice && <p className="text-sm text-emerald-400">{notice}</p>}

        {published && (
          <p className="rounded-md border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">
            Ürün oluşturuldu ({published.variantCount} varyasyon).{' '}
            <a href={published.adminUrl} target="_blank" rel="noreferrer" className="underline">
              Shopify admin&apos;de aç →
            </a>
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" variant="ghost" onClick={saveOnly} disabled={busy || publishing}>
            Taslağı kaydet
          </Button>
          <Button type="button" onClick={publish} disabled={!canPublish}>
            {publishing ? 'Shopify’a gönderiliyor…' : 'Onayla ve Shopify’a gönder'}
          </Button>
          {hasActiveJobs && (
            <span className="text-xs text-neutral-500">
              Mockup üretimi bitene kadar gönderim kapalı.
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}

function priceRange(rows: VariantRow[]): string {
  const prices = rows
    .map((r) => Number(r.price.replace(',', '.')))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (prices.length === 0) return '—';
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? min.toFixed(2) : `${min.toFixed(2)} – ${max.toFixed(2)}`;
}
