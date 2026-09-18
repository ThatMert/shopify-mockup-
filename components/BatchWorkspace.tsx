'use client';

import { useCallback, useEffect, useState } from 'react';
import type { BatchDTO } from '@/lib/types';
import { BatchProgress } from './BatchProgress';
import { ExportBar } from './ExportBar';
import { ProductReviewCard } from './ProductReviewCard';
import { Button, ErrorBox } from './ui';

/** Is calisirken durumu bu araliklarla yeniler (DraftWorkspace ile ayni ritim). */
const POLL_MS = 1500;

/**
 * Toplu uretimin ilerleme + inceleme ekrani.
 * Mockup'lar uretildikce urun kartlari dolar; kullanici metinleri duzenleyip
 * onaylar, sonra CSV indirir veya dogrudan Shopify'a aktarir.
 */
export function BatchWorkspace({ initial }: { initial: BatchDTO }) {
  const [batch, setBatch] = useState<BatchDTO>(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('all');

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/batches/${initial.id}`);
    if (!res.ok) return;
    const json = await res.json();
    setBatch(json.batch);
  }, [initial.id]);

  const active = batch.counts.queued + batch.counts.running;

  useEffect(() => {
    if (active === 0) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [active, refresh]);

  async function cancelAll() {
    setBusy(true);
    try {
      await fetch(`/api/batches/${batch.id}/jobs`, { method: 'DELETE' });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function approveAll() {
    setBusy(true);
    try {
      const targets = batch.drafts.filter(
        (d) => !d.approved && d.assets.some((a) => a.kind === 'mockup'),
      );
      for (const draft of targets) {
        await fetch(`/api/drafts/${draft.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approved: true }),
        });
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const drafts = batch.drafts.filter((d) =>
    filter === 'all' ? true : filter === 'approved' ? d.approved : !d.approved,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-sm text-neutral-300">{batch.boardName || batch.boardUrl}</h1>
        <span className="text-xs text-neutral-500">
          {batch.drafts.length} ürün · {batch.pins.filter((p) => p.selected).length} tasarım
        </span>
        <a
          href={batch.boardUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-neutral-500 underline hover:text-neutral-300"
        >
          board →
        </a>
      </div>

      <ErrorBox>{error}</ErrorBox>

      <BatchProgress batch={batch} onCancel={() => void cancelAll()} busy={busy} />

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-medium text-neutral-200">4. İnceleme ve onay</h2>
        <div className="flex items-center gap-1 text-xs">
          {(
            [
              ['all', 'tümü'],
              ['pending', 'bekleyen'],
              ['approved', 'onaylı'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded px-2 py-1 ${
                filter === value
                  ? 'bg-neutral-800 text-neutral-200'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={() => void approveAll()}
          disabled={busy || batch.drafts.every((d) => d.approved)}
          className="ml-auto"
        >
          Tümünü onayla
        </Button>
      </div>

      <div className="space-y-4">
        {drafts.length === 0 ? (
          <p className="rounded-md border border-dashed border-neutral-800 px-4 py-10 text-center text-sm text-neutral-500">
            Bu filtrede ürün yok.
          </p>
        ) : (
          drafts.map((draft) => (
            <ProductReviewCard key={draft.id} draft={draft} onSaved={() => void refresh()} />
          ))
        )}
      </div>

      <ExportBar batch={batch} onDone={() => void refresh()} />
    </div>
  );
}
