import 'server-only';
import { COMFY_URL, type ComfyGraph } from './client';

/**
 * Bir workflow'un istedigi model dosyalarinin ComfyUI'de gercekten kurulu
 * olup olmadigini kontrol eder.
 *
 * Aksi halde is kuyruga giriyor, ComfyUI "value not in list" gibi anlasilmasi
 * zor bir hata donduruyor ve kullanici nedenini goremiyor. Burada dosya adi ve
 * hangi klasore ait oldugu acikca bildiriliyor.
 */

/** ComfyUI /object_info ciktisinin ihtiyacimiz olan kismi. */
type ObjectInfo = Record<
  string,
  { input?: { required?: Record<string, unknown>; optional?: Record<string, unknown> } }
>;

let cache: { at: number; data: ObjectInfo } | null = null;
const TTL_MS = 30_000;

async function objectInfo(): Promise<ObjectInfo> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const res = await fetch(`${COMFY_URL}/object_info`);
  if (!res.ok) throw new Error(`ComfyUI /object_info okunamadı (HTTP ${res.status})`);
  const data = (await res.json()) as ObjectInfo;
  cache = { at: Date.now(), data };
  return data;
}

/** Hangi loader girdisi hangi model klasorune bakiyor (hata mesajinda gostermek icin). */
const FOLDER_HINT: Record<string, string> = {
  unet_name: 'models/diffusion_models/',
  ckpt_name: 'models/checkpoints/',
  clip_name: 'models/text_encoders/',
  clip_name1: 'models/text_encoders/',
  clip_name2: 'models/text_encoders/',
  vae_name: 'models/vae/',
  lora_name: 'models/loras/',
  control_net_name: 'models/controlnet/',
  style_model_name: 'models/style_models/',
};

export interface MissingModel {
  node: string;
  input: string;
  value: string;
  folder: string;
  available: string[];
}

/** Grafta gecen model dosyalarini ComfyUI'nin listeleriyle karsilastirir. */
export async function findMissingModels(graph: ComfyGraph): Promise<MissingModel[]> {
  const info = await objectInfo();
  const missing: MissingModel[] = [];

  for (const [nodeId, node] of Object.entries(graph)) {
    const schema = info[node.class_type];
    if (!schema?.input) continue;

    const fields = { ...(schema.input.required ?? {}), ...(schema.input.optional ?? {}) };

    for (const [inputName, value] of Object.entries(node.inputs)) {
      // Baska bir node'a baglanti (["3", 0]) ise dosya adi degildir.
      if (Array.isArray(value) || typeof value !== 'string') continue;
      if (!(inputName in FOLDER_HINT)) continue;

      const spec = fields[inputName];
      // Combo girdiler [["a.safetensors", "b.safetensors"], {...}] seklinde gelir.
      const options = Array.isArray(spec) && Array.isArray(spec[0]) ? (spec[0] as string[]) : null;
      if (!options) continue;

      if (!options.includes(value)) {
        missing.push({
          node: `${nodeId} (${node.class_type})`,
          input: inputName,
          value,
          folder: FOLDER_HINT[inputName],
          available: options,
        });
      }
    }
  }

  return missing;
}

/** Eksik model varsa okunabilir bir hata firlatir. */
export async function assertModelsInstalled(graph: ComfyGraph): Promise<void> {
  const missing = await findMissingModels(graph);
  if (missing.length === 0) return;

  const lines = missing.map(
    (m) =>
      `• ${m.value} → ${m.folder} (kurulu olanlar: ${m.available.join(', ') || 'yok'})`,
  );
  throw new Error(
    `ComfyUI'de şu model dosyaları kurulu değil:\n${lines.join('\n')}\n` +
      `Dosyaları ilgili klasöre koyup ComfyUI'yi yeniden başlatın.`,
  );
}
