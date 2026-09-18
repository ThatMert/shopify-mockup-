'use client';

import { useState } from 'react';
import type { BatchDTO } from '@/lib/types';
import { Button, Card, ErrorBox } from './ui';

interface PublishResultRow {
  draftId: string;
  title: string;
  ok: boolean;
  adminUrl?: string;
  error?: string;
}

/**
 * Adim 4'un sonu — cikti.
 *
 * CSV: gorseller once Shopify Files'a yuklenip herkese acik CDN adresleri
 * alinir, sonra magazanin export sutun duzeninde dosya indirilir.
 * Dogrudan aktarim: onaylanan urunler Admin API ile taslak veya yayinda olusur.
 */
export function ExportBar({ batch, onDone }: { batch: BatchDTO; onDone: () => void }) {
  const [busy, setBusy] = useState<'csv' | 'push' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [results, setResults] = useState<PublishResultRow[] | null>(null);
  const [publishStatus, setPublishStatus] = useState<'DRAFT' | 'ACTIVE'>('DRAFT');

  const approved = batch.drafts.filter((d) => d.approved);
  const pending = batch.drafts.filter((d) => !d.approved);

  async function downloadCsv() {
    setError('');
    setNotice('');
    setBusy('csv');
    try {
      const res = await fetch(`/api/batches/${batch.id}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          onlyApproved: true,
          status: publishStatus === 'ACTIVE' ? 'active' : 'draft',
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(json.error);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ??
        `mockup-${batch.id}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice(`${approved.length} ürün CSV olarak indirildi.`);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function pushToShopify() {
    setError('');
    setNotice('');
    setResults(null);
    setBusy('push');
    try {
      // Sunucu her istekte zaman butcesi kadar urun gonderir; kalan oldukca
      // ayni istek tekrarlanir. Basarisiz olanlar tekrar denenmesin diye
      // `exclude` ile bildirilir.
      const all: PublishResultRow[] = [];
      const exclude: string[] = [];
      let remaining = 1;
      while (remaining > 0) {
        const res = await fetch(`/api/batches/${batch.id}/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: publishStatus, onlyApproved: true, exclude }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);

        all.push(...json.results);
        exclude.push(
          ...json.results
            .filter((r: PublishResultRow & { draftId?: string }) => !r.ok && r.draftId)
            .map((r: PublishResultRow & { draftId: string }) => r.draftId),
        );
        remaining = json.remaining ?? 0;
        setResults([...all]);
        setNotice(
          remaining > 0
            ? `${all.filter((r) => r.ok).length} ürün gönderildi, ${remaining} ürün sırada…`
            : `${all.filter((r) => r.ok).length}/${all.length} ürün Shopify'a gönderildi.`,
        );
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card
      title="Çıktı"
      hint={`${approved.length} ürün onaylı${pending.length > 0 ? ` · ${pending.length} ürün bekliyor` : ''}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => void downloadCsv()} disabled={busy !== null || approved.length === 0}>
          {busy === 'csv' ? 'CSV hazırlanıyor…' : 'CSV indir'}
        </Button>

        <Button
          type="button"
          variant="ghost"
          onClick={() => void pushToShopify()}
          disabled={busy !== null || approved.length === 0}
        >
          {busy === 'push' ? 'Gönderiliyor…' : "Shopify'a aktar"}
        </Button>

        <div className="flex items-center gap-3 text-xs text-neutral-400">
          {(['DRAFT', 'ACTIVE'] as const).map((value) => (
            <label key={value} className="flex cursor-pointer items-center gap-1.5">
              <input
                type="radio"
                name="publish-status"
                checked={publishStatus === value}
                onChange={() => setPublishStatus(value)}
                className="h-3.5 w-3.5 accent-emerald-500"
              />
              {value === 'DRAFT' ? 'taslak olarak yükle' : 'direkt yayınla'}
            </label>
          ))}
        </div>
      </div>

      <p className="mt-3 text-xs text-neutral-600">
        CSV&apos;deki görsel adresleri Shopify Files&apos;a yüklenen kalıcı CDN bağlantılarıdır; CSV&apos;yi
        Shopify Admin → Ürünler → İçe aktar ekranından yükleyebilirsiniz.
      </p>

      <div className="mt-3 space-y-2">
        <ErrorBox>{error}</ErrorBox>
        {notice && <p className="text-sm text-emerald-400">{notice}</p>}

        {results && (
          <ul className="space-y-1 text-xs">
            {results.map((r) => (
              <li key={r.draftId} className={r.ok ? 'text-neutral-400' : 'text-red-400'}>
                {r.ok ? (
                  <>
                    {r.title} —{' '}
                    <a href={r.adminUrl} target="_blank" rel="noreferrer" className="underline">
                      Shopify&apos;da aç
                    </a>
                  </>
                ) : (
                  <>
                    {r.title} — {r.error}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
