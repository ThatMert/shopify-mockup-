'use client';

import { useEffect, useState } from 'react';

interface Health {
  mode?: 'cloud' | 'local';
  aiEnabled?: boolean;
  comfy: { ok: boolean; detail: string; url: string };
  shopify: { ok: boolean; detail: string; eksikIzinler?: string[] };
  materials: { ok: boolean; detail: string };
  queue: { current: string | null; pending: number; running: boolean };
}

/** Uc durumun tek satirda ozeti; ust cubukta canli gosterilir. */
export function SystemStatus() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const res = await fetch('/api/health');
        const json = (await res.json()) as Health;
        if (alive) setHealth(json);
      } catch {
        if (alive) setHealth(null);
      } finally {
        if (alive) setLoading(false);
      }
    };

    void load();
    // Saglik kontrolu disariya istek attigi icin seyrek yenilenir.
    const timer = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  if (loading) {
    return <span className="text-xs text-neutral-600">durum kontrol ediliyor…</span>;
  }
  if (!health) {
    return <span className="text-xs text-red-400">durum alınamadı</span>;
  }

  const queueBusy = health.queue.running || health.queue.pending > 0;

  const pills = [
    // Bulut surumunde AI yok; ComfyUI rozeti yaniltici olurdu.
    ...(health.aiEnabled === false
      ? []
      : [
          {
            label: 'ComfyUI',
            ok: health.comfy.ok,
            title: health.comfy.ok ? health.comfy.detail : `Bağlanılamadı: ${health.comfy.url}`,
          },
        ]),
    {
      label: 'Shopify',
      ok: health.shopify.ok,
      title: health.shopify.detail,
    },
    {
      label: queueBusy ? `Kuyruk ${health.queue.pending + (health.queue.running ? 1 : 0)}` : 'Kuyruk',
      ok: true,
      busy: queueBusy,
      title: queueBusy ? 'Mockup işleri sürüyor' : 'Kuyruk boş',
    },
  ];

  return (
    <div className="flex items-center gap-1.5">
      {pills.map((pill) => (
        <span
          key={pill.label}
          title={pill.title}
          className="flex items-center gap-1.5 rounded-full bg-neutral-900/70 px-2.5 py-1 text-[11px] text-neutral-400 ring-1 ring-inset ring-neutral-800"
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              'busy' in pill && pill.busy
                ? 'animate-pulse bg-sky-400'
                : pill.ok
                  ? 'bg-emerald-400'
                  : 'bg-red-500'
            }`}
          />
          {pill.label}
        </span>
      ))}
    </div>
  );
}
