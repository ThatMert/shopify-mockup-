'use client';

import type { AssetDTO, JobDTO } from '@/lib/types';
import { fileUrl } from '@/lib/types';
import { Card, ProgressBar, StatusDot } from './ui';

/**
 * Adim 3 — uretilen mockup'lar. Calisan isler ilerleme cubugu ile,
 * biten gorseller secilebilir kart olarak gosterilir.
 * Sadece secili gorseller Shopify'a gonderilir.
 */
export function MockupGrid({
  jobs,
  assets,
  onToggle,
  onDelete,
  onCancel,
  disabled,
}: {
  jobs: JobDTO[];
  assets: AssetDTO[];
  onToggle: (assetId: string, selected: boolean) => void;
  onDelete: (assetId: string) => void;
  onCancel: () => void;
  disabled?: boolean;
}) {
  const mockups = assets.filter((a) => a.kind === 'mockup');
  const active = jobs.filter((j) => j.status === 'queued' || j.status === 'running');
  const failed = jobs.filter((j) => j.status === 'failed');
  const selectedCount = mockups.filter((a) => a.selected).length;

  if (jobs.length === 0 && mockups.length === 0) return null;

  return (
    <Card
      title="3. Üretilen mockuplar"
      hint={`${selectedCount} / ${mockups.length} görsel Shopify'a gönderilmek üzere seçili.`}
    >
      {active.length > 0 && (
        <div className="mb-5 space-y-2 rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-400">
              {active.length} iş sırada · tek GPU için sırayla işleniyor
            </span>
            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-neutral-500 underline hover:text-red-400"
            >
              tümünü iptal et
            </button>
          </div>
          {active.map((job) => (
            <div key={job.id} className="flex items-center gap-3">
              <StatusDot status={job.status} />
              <span className="w-40 shrink-0 truncate text-xs text-neutral-400">
                {job.materialId} / {job.templateId}
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
        <ul className="mb-5 space-y-1 rounded-md border border-red-900/60 bg-red-950/30 p-3 text-xs text-red-300">
          {failed.map((job) => (
            <li key={job.id}>
              <strong>
                {job.materialId}/{job.templateId}:
              </strong>{' '}
              {job.error}
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {mockups.map((asset) => (
          <figure
            key={asset.id}
            className={`group relative overflow-hidden rounded-md border transition ${
              asset.selected ? 'border-emerald-500' : 'border-neutral-800 opacity-60'
            }`}
          >
            <button
              type="button"
              disabled={disabled}
              onClick={() => onToggle(asset.id, !asset.selected)}
              className="block w-full"
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

            <figcaption className="flex items-center justify-between px-2 py-1.5 text-[10px] text-neutral-500">
              <span>
                {asset.width}×{asset.height}
              </span>
              <button
                type="button"
                onClick={() => onDelete(asset.id)}
                disabled={disabled}
                className="opacity-0 transition group-hover:opacity-100 hover:text-red-400 disabled:opacity-0"
              >
                sil
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
    </Card>
  );
}
