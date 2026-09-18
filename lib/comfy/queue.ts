import 'server-only';
import { prisma } from '@/lib/db';
import { IS_CLOUD, REQUEST_BUDGET_MS } from '@/lib/runtime';
import { runJob } from './runner';

/**
 * Mockup is kuyrugu. Iki calisma bicimi var:
 *
 * YEREL — tek GPU icin bellekte seri kuyruk. ComfyUI'nin kendi kuyruguna toplu
 * atmak ilerlemeyi is bazinda izlemeyi ve iptali zorlastiriyor, VRAM baskisi da
 * yaratiyor; bu yuzden isler burada tek tek surduruluyor. Next.js dev modunda
 * modul yeniden yuklenince kaybolmasin diye durum globalThis'te tutulur.
 *
 * BULUT (Netlify) — arka planda surekli calisan bir surec yok; her istek en
 * fazla 60 sn yasiyor. Kuyrugun kendisi veritabani: "queued" durumdaki isler.
 * Acik bir sekme /api/queue/tick'i cagirdikca isler zaman butcesi icinde
 * atomik olarak kapilip (queued -> running) calistirilir. Ayni anda birden
 * fazla sekme calisirsa ayni isi iki kez almazlar.
 */

// ---------------------------------------------------------------- yerel

interface QueueState {
  pending: string[];
  current: string | null;
  running: boolean;
  controller: AbortController | null;
}

const globalForQueue = globalThis as unknown as { __mockupQueue?: QueueState };

const state: QueueState = (globalForQueue.__mockupQueue ??= {
  pending: [],
  current: null,
  running: false,
  controller: null,
});

/** Kuyruga is ekler. Yerelde isleyiciyi hemen baslatir; bulutta tick bekler. */
export function enqueue(jobIds: string[]): void {
  if (IS_CLOUD) return; // isler zaten DB'de "queued"
  for (const id of jobIds) {
    if (!state.pending.includes(id) && state.current !== id) state.pending.push(id);
  }
  void drain();
}

async function drain(): Promise<void> {
  if (state.running) return;
  state.running = true;

  try {
    while (state.pending.length > 0) {
      const jobId = state.pending.shift()!;

      // Kuyrukta beklerken iptal edilmis olabilir.
      const job = await prisma.mockupJob.findUnique({ where: { id: jobId } });
      if (!job || job.status === 'cancelled') continue;

      state.current = jobId;
      state.controller = new AbortController();

      try {
        await runJob(jobId, state.controller.signal);
      } catch (err) {
        // runJob hatayi zaten DB'ye yazdi; kuyruk durmasin diye burada yutuyoruz.
        console.error(`[queue] ${jobId} başarısız:`, err instanceof Error ? err.message : err);
      } finally {
        state.current = null;
        state.controller = null;
      }
    }
  } finally {
    state.running = false;
  }

  // Yarista (drain biterken enqueue gelirse) is kalmadigindan emin ol.
  if (state.pending.length > 0) void drain();
}

// ---------------------------------------------------------------- bulut

/**
 * Bir is "running"de bu sureden uzun kalirsa, onu calistiran fonksiyon
 * zaman asimina ugramis sayilir ve is yeniden kuyruga alinir.
 */
const STALE_RUNNING_MS = 3 * 60_000;

/** Tek bir isi calistirmak icin kalan butcenin en az bu kadari olmali. */
const MIN_REMAINING_MS = 12_000;

export interface TickResult {
  mode: 'cloud' | 'local';
  processed: number;
  failed: number;
  remaining: number;
}

/**
 * Bulutta: kuyruktaki isleri zaman butcesi dolana kadar isler.
 * Yerelde bir sey yapmaz (bellekteki kuyruk zaten calisiyor).
 */
export async function processQueue(budgetMs = REQUEST_BUDGET_MS): Promise<TickResult> {
  if (!IS_CLOUD) {
    return { mode: 'local', processed: 0, failed: 0, remaining: state.pending.length };
  }

  const deadline = Date.now() + budgetMs;

  // Yarim kalmis isleri geri al.
  await prisma.mockupJob.updateMany({
    where: { status: 'running', updatedAt: { lt: new Date(Date.now() - STALE_RUNNING_MS) } },
    data: { status: 'queued', progress: 0 },
  });

  let processed = 0;
  let failed = 0;

  while (deadline - Date.now() > MIN_REMAINING_MS) {
    const next = await prisma.mockupJob.findFirst({
      where: { status: 'queued' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!next) break;

    // Atomik kapma: baska bir istek ayni isi aldiysa count 0 doner.
    const claimed = await prisma.mockupJob.updateMany({
      where: { id: next.id, status: 'queued' },
      data: { status: 'running', progress: 0 },
    });
    if (claimed.count === 0) continue;

    try {
      await runJob(next.id);
      processed++;
    } catch (err) {
      failed++;
      console.error(`[queue] ${next.id} başarısız:`, err instanceof Error ? err.message : err);
    }
  }

  const remaining = await prisma.mockupJob.count({
    where: { status: { in: ['queued', 'running'] } },
  });
  return { mode: 'cloud', processed, failed, remaining };
}

// ---------------------------------------------------------------- ortak

/** Belirli bir isi iptal eder; yerelde calisiyorsa ComfyUI'ye interrupt gonderilir. */
export async function cancelJob(jobId: string): Promise<void> {
  state.pending = state.pending.filter((id) => id !== jobId);

  await prisma.mockupJob.updateMany({
    where: { id: jobId, status: { in: ['queued', 'running'] } },
    data: { status: 'cancelled' },
  });

  if (state.current === jobId) state.controller?.abort();
}

/** Bir taslagin bekleyen ve calisan tum islerini iptal eder. */
export async function cancelDraft(draftId: string): Promise<void> {
  const jobs = await prisma.mockupJob.findMany({
    where: { draftId, status: { in: ['queued', 'running'] } },
    select: { id: true },
  });
  for (const job of jobs) await cancelJob(job.id);
}

export async function queueStatus(): Promise<{
  current: string | null;
  pending: number;
  running: boolean;
}> {
  if (!IS_CLOUD) {
    return { current: state.current, pending: state.pending.length, running: state.running };
  }
  const [pending, running] = await Promise.all([
    prisma.mockupJob.count({ where: { status: 'queued' } }),
    prisma.mockupJob.findFirst({ where: { status: 'running' }, select: { id: true } }),
  ]);
  return { current: running?.id ?? null, pending, running: !!running };
}
