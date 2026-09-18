'use client';

import type { BatchDTO } from '@/lib/types';
import { Card, ProgressBar, StatusDot } from './ui';

/**
 * Adim 3'un devami — toplu uretimin canli durumu.
 * Sayaclar batch'teki tum MockupJob kayitlarindan hesaplanir.
 */
export function BatchProgress({
  batch,
  onCancel,
  busy,
}: {
  batch: BatchDTO;
  onCancel: () => void;
  busy?: boolean;
}) {
  const { counts } = batch;
  if (counts.total === 0) return null;

  const finished = counts.done + counts.failed + counts.cancelled;
  const percent = Math.round((finished / counts.total) * 100);
  const active = counts.queued + counts.running;

  const running = batch.drafts
    .flatMap((d) => d.jobs.map((j) => ({ job: j, draft: d })))
    .filter((x) => x.job.status === 'running' || x.job.status === 'queued')
    .slice(0, 6);

  const failed = batch.drafts
    .flatMap((d) => d.jobs.map((j) => ({ job: j, draft: d })))
    .filter((x) => x.job.status === 'failed');

  return (
    <Card
      title="3. Mockup üretimi"
      hint={`${counts.done} tamamlandı · ${counts.running} çalışıyor · ${counts.queued} bekliyor${
        counts.failed > 0 ? ` · ${counts.failed} başarısız` : ''
      }`}
    >
      <ProgressBar value={percent} label={`${finished}/${counts.total}`} />

      {active > 0 && (
        <div className="mt-4 space-y-2 rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-400">
              {active} iş sırada · tek GPU için sırayla işleniyor
            </span>
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="text-xs text-neutral-500 underline hover:text-red-400 disabled:opacity-40"
            >
              tümünü iptal et
            </button>
          </div>
          {running.map(({ job, draft }) => (
            <div key={job.id} className="flex items-center gap-3">
              <StatusDot status={job.status} />
              <span className="w-56 shrink-0 truncate text-xs text-neutral-400">
                {draft.title || draft.id} · {job.templateId}
              </span>
              <ProgressBar
                value={job.status === 'running' ? job.progress : 0}
                label={job.status === 'running' ? `%${job.progress}` : 'sırada'}
              />
            </div>
          ))}
        </div>
      )}

      {failed.length > 0 && (
        <ul className="mt-4 space-y-1 rounded-md border border-red-900/60 bg-red-950/30 p-3 text-xs text-red-300">
          {failed.map(({ job, draft }) => (
            <li key={job.id}>
              <strong>
                {draft.title || draft.id} / {job.materialId}-{job.templateId}:
              </strong>{' '}
              {job.error}
            </li>
          ))}
        </ul>
      )}

      {batch.pins.some((p) => p.error) && (
        <ul className="mt-4 space-y-1 rounded-md border border-amber-900/60 bg-amber-950/20 p-3 text-xs text-amber-300">
          {batch.pins
            .filter((p) => p.error)
            .map((pin) => (
              <li key={pin.id}>
                <a href={pin.pinUrl} target="_blank" rel="noreferrer" className="underline">
                  Pin {pin.pinId}
                </a>{' '}
                indirilemedi: {pin.error}
              </li>
            ))}
        </ul>
      )}
    </Card>
  );
}
