import 'server-only';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';

export const COMFY_URL = (process.env.COMFY_URL ?? 'http://127.0.0.1:8188').replace(/\/$/, '');

/** ComfyUI'nin /history ciktisindaki gorsel referansi. */
export interface ComfyImageRef {
  filename: string;
  subfolder: string;
  type: string; // output | temp | input
}

export interface QueueResult {
  prompt_id: string;
  number: number;
  node_errors: Record<string, unknown>;
}

/** API-format workflow: node id -> { class_type, inputs }. */
export type ComfyGraph = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

async function comfyFetch(pathname: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${COMFY_URL}${pathname}`, init);
  } catch (err) {
    // undici baglanti hatalarini "fetch failed" diye yutuyor; kullaniciya
    // gercek sebebi soyle. En sik senaryo: ComfyUI kapali ya da cokmus.
    const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : '';
    throw new Error(
      `ComfyUI'ye ulaşılamıyor (${COMFY_URL}). Çalıştığından emin olun; ` +
        `büyük bir model yüklenirken bellek yetersizliğinden çökmüş olabilir.` +
        (cause ? ` [${cause}]` : ''),
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `ComfyUI ${pathname} -> ${res.status} ${res.statusText}${body ? `: ${body.slice(0, 500)}` : ''}`,
    );
  }
  return res;
}

/** ComfyUI ayakta mi ve hangi surumde? */
export async function checkComfy(): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await comfyFetch('/system_stats');
    const stats = (await res.json()) as { system?: { comfyui_version?: string } };
    return { ok: true, detail: stats.system?.comfyui_version ?? 'bilinmiyor' };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

/** Bir gorseli ComfyUI'nin input klasorune yukler, kullanilacak dosya adini dondurur. */
export async function uploadImage(
  data: Buffer,
  filename: string,
  opts: { subfolder?: string; overwrite?: boolean } = {},
): Promise<string> {
  const form = new FormData();
  form.append('image', new Blob([new Uint8Array(data)]), filename);
  form.append('overwrite', String(opts.overwrite ?? true));
  if (opts.subfolder) form.append('subfolder', opts.subfolder);

  const res = await comfyFetch('/upload/image', { method: 'POST', body: form });
  const json = (await res.json()) as { name: string; subfolder?: string };
  // LoadImage widget'i alt klasoru "subfolder/name" olarak bekler.
  return json.subfolder ? `${json.subfolder}/${json.name}` : json.name;
}

/** Workflow'u kuyruga atar. */
export async function queuePrompt(graph: ComfyGraph, clientId: string): Promise<QueueResult> {
  const res = await comfyFetch('/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: graph, client_id: clientId }),
  });
  return (await res.json()) as QueueResult;
}

/** Calisan/bekleyen isi iptal eder. */
export async function interrupt(): Promise<void> {
  await comfyFetch('/interrupt', { method: 'POST' }).catch(() => undefined);
}

/** Kuyruktan belirli prompt'lari siler. */
export async function deleteFromQueue(promptIds: string[]): Promise<void> {
  await comfyFetch('/queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ delete: promptIds }),
  }).catch(() => undefined);
}

/** Tamamlanmis bir prompt'un urettigi gorselleri dondurur. */
export async function getHistoryImages(promptId: string): Promise<ComfyImageRef[]> {
  const res = await comfyFetch(`/history/${promptId}`);
  const history = (await res.json()) as Record<
    string,
    { outputs?: Record<string, { images?: ComfyImageRef[] }> }
  >;
  const entry = history[promptId];
  if (!entry?.outputs) return [];

  const images: ComfyImageRef[] = [];
  for (const output of Object.values(entry.outputs)) {
    for (const img of output.images ?? []) {
      // temp/preview goruntulerini atla, sadece kalici ciktilari al.
      if (img.type === 'output') images.push(img);
    }
  }
  return images;
}

/** Uretilen gorselin ham baytlarini indirir. */
export async function downloadImage(ref: ComfyImageRef): Promise<Buffer> {
  const qs = new URLSearchParams({
    filename: ref.filename,
    subfolder: ref.subfolder ?? '',
    type: ref.type ?? 'output',
  });
  const res = await comfyFetch(`/view?${qs}`);
  return Buffer.from(await res.arrayBuffer());
}

export interface RunEvents {
  onProgress?: (percent: number) => void;
  onNode?: (nodeId: string | null) => void;
}

/**
 * Workflow'u calistirir ve bitene kadar bekler.
 * Ilerleme ComfyUI WebSocket'i uzerinden takip edilir; is bitince ciktilar indirilir.
 */
export async function runWorkflow(
  graph: ComfyGraph,
  events: RunEvents = {},
  signal?: AbortSignal,
): Promise<{ promptId: string; images: ComfyImageRef[] }> {
  const clientId = randomUUID();
  const wsUrl = `${COMFY_URL.replace(/^http/, 'ws')}/ws?clientId=${clientId}`;
  const ws = new WebSocket(wsUrl);

  // Kuyruga atmadan once soketin acilmasini bekle ki hicbir olay kacmasin.
  await new Promise<void>((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  try {
    const queued = await queuePrompt(graph, clientId);
    const promptId = queued.prompt_id;

    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        void interrupt();
        void deleteFromQueue([promptId]);
        reject(new Error('İş iptal edildi'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      const cleanup = () => signal?.removeEventListener('abort', onAbort);

      ws.on('message', (raw, isBinary) => {
        if (isBinary) return; // ara onizleme kareleri; gerek yok
        let msg: { type?: string; data?: Record<string, unknown> };
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }
        const data = msg.data ?? {};
        if (data.prompt_id && data.prompt_id !== promptId) return;

        switch (msg.type) {
          case 'progress': {
            const value = Number(data.value ?? 0);
            const max = Number(data.max ?? 0);
            if (max > 0) events.onProgress?.(Math.round((value / max) * 100));
            break;
          }
          case 'executing': {
            const node = (data.node as string | null) ?? null;
            events.onNode?.(node);
            // node === null && prompt_id eslesiyor => bu prompt bitti
            if (node === null && data.prompt_id === promptId) {
              cleanup();
              resolve();
            }
            break;
          }
          case 'execution_success': {
            cleanup();
            resolve();
            break;
          }
          case 'execution_error': {
            cleanup();
            reject(
              new Error(
                `ComfyUI hatası [${data.node_type ?? '?'}]: ${data.exception_message ?? 'bilinmeyen hata'}`,
              ),
            );
            break;
          }
          case 'execution_interrupted': {
            cleanup();
            reject(new Error('ComfyUI işi kesildi'));
            break;
          }
        }
      });

      ws.once('close', () => {
        cleanup();
        reject(
          new Error(
            'ComfyUI bağlantısı iş sırasında koptu. Süreç büyük model yüklerken ' +
              'bellek yetersizliğinden çökmüş olabilir; ComfyUI log dosyasına bakın.',
          ),
        );
      });
      ws.once('error', (err) => {
        cleanup();
        reject(err);
      });
    });

    const images = await getHistoryImages(promptId);
    return { promptId, images };
  } finally {
    ws.removeAllListeners();
    ws.close();
  }
}
