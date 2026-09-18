/** Arayuzde tekrar eden kucuk bicimlendirmeler. */

const UNITS: Array<{ limit: number; divisor: number; label: string }> = [
  { limit: 60_000, divisor: 1000, label: 'saniye' },
  { limit: 3_600_000, divisor: 60_000, label: 'dakika' },
  { limit: 86_400_000, divisor: 3_600_000, label: 'saat' },
  { limit: 2_592_000_000, divisor: 86_400_000, label: 'gün' },
];

/** "3 dakika önce" gibi goreli zaman; cok eskiyse tarih. */
export function timeAgo(date: Date | string): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  const diff = Date.now() - value.getTime();

  if (diff < 45_000) return 'az önce';

  for (const unit of UNITS) {
    if (diff < unit.limit) {
      return `${Math.round(diff / unit.divisor)} ${unit.label} önce`;
    }
  }

  return value.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
}

/** Batch/taslak durumlarinin Turkce karsiligi ve rengi. */
export const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  collecting: { label: 'toplanıyor', className: 'bg-sky-500/15 text-sky-300 ring-sky-500/30' },
  generating: {
    label: 'üretiliyor',
    className: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  },
  review: { label: 'incelemede', className: 'bg-amber-500/15 text-amber-300 ring-amber-500/30' },
  done: { label: 'tamamlandı', className: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30' },
  draft: { label: 'taslak', className: 'bg-neutral-500/15 text-neutral-300 ring-neutral-500/30' },
  ready: { label: 'hazır', className: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30' },
  published: {
    label: 'yayında',
    className: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  },
  publishing: { label: 'gönderiliyor', className: 'bg-sky-500/15 text-sky-300 ring-sky-500/30' },
  failed: { label: 'hata', className: 'bg-red-500/15 text-red-300 ring-red-500/30' },
};

export function statusBadge(status: string) {
  return (
    STATUS_LABELS[status] ?? {
      label: status,
      className: 'bg-neutral-500/15 text-neutral-300 ring-neutral-500/30',
    }
  );
}
