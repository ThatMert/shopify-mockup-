import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { MATERIALS_DIR } from '@/lib/paths';
import { AI_ENABLED, IS_CLOUD } from '@/lib/runtime';
import { storage } from '@/lib/storage';
import { readPlacement } from '@/lib/mockup/store';
import { BUNDLED_MATERIALS } from './bundled.generated';
import type { Placement } from '@/lib/mockup/placement';
import {
  materialSchema,
  type Material,
  type Method,
  type ResolvedMethod,
  type ResolvedMaterial,
  type ResolvedTemplate,
} from './schema';

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);

/** Sablon klasorunun depolama anahtari. */
function templateDir(materialId: string): string {
  return `storage/templates/${materialId}`;
}

/**
 * Materyal JSON'larinin ham icerigi. Bulutta derleme aninda gomulen kopya,
 * yerelde her seferinde diskten okunan dosyalar kullanilir.
 */
async function readMaterialSources(): Promise<Array<{ file: string; data: unknown }>> {
  if (IS_CLOUD) return BUNDLED_MATERIALS;

  await fs.mkdir(MATERIALS_DIR, { recursive: true });
  const files = (await fs.readdir(MATERIALS_DIR)).filter((f) => f.endsWith('.json')).sort();
  return Promise.all(
    files.map(async (file) => ({
      file,
      data: JSON.parse(await fs.readFile(path.join(MATERIALS_DIR, file), 'utf8')) as unknown,
    })),
  );
}

/** "angle_front_left.png" -> "Angle Front Left" */
function labelFromFilename(file: string): string {
  return path
    .basename(file, path.extname(file))
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * config/materials/*.json dosyalarini okur ve her materyalin sablonlarini
 * storage/templates/<id>/ klasoruyle birlestirir:
 *  - JSON'da tanimli sablonlar etiket/prompt'unu korur,
 *  - klasore elle atilmis ekstra gorseller otomatik sablon olarak eklenir.
 * Boylece yeni materyal eklemek = 1 JSON + birkac gorsel.
 */
/**
 * Bulutta her sablon icin Blobs'a stat + yerlesim istegi atiliyor; ayni istek
 * icinde (orn. bir batch'in onlarca isi) tekrar tekrar yapilmasin diye sonuc
 * kisa sure onbellekte tutulur. Sablon/yerlesim yazildiginda temizlenir.
 */
const CACHE_TTL_MS = IS_CLOUD ? 5_000 : 0;
let cache: { at: number; value: Promise<ResolvedMaterial[]> } | null = null;

export function invalidateMaterials(): void {
  cache = null;
}

export async function loadMaterials(): Promise<ResolvedMaterial[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  const value = loadMaterialsUncached();
  cache = { at: Date.now(), value };
  value.catch(() => {
    cache = null;
  });
  return value;
}

async function loadMaterialsUncached(): Promise<ResolvedMaterial[]> {
  const sources = await readMaterialSources();

  const materials: ResolvedMaterial[] = [];
  for (const { file, data } of sources) {
    let parsed: Material;
    try {
      parsed = materialSchema.parse(data);
    } catch (err) {
      throw new Error(
        `Materyal config'i geçersiz: config/materials/${file} — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!parsed.enabled) continue;
    materials.push(await resolveTemplates(parsed));
  }
  return materials;
}

export async function loadMaterial(id: string): Promise<ResolvedMaterial | null> {
  const all = await loadMaterials();
  return all.find((m) => m.id === id) ?? null;
}

/**
 * Yontem cozumleme sirasi: sablonun kendi method'u > materyalin defaultMethod'u >
 * otomatik (yerlesim varsa kompozisyon, yoksa ComfyUI).
 */
function resolveMethod(
  method: Method,
  materialDefault: Method,
  placement: Placement | null,
): ResolvedMethod {
  // AI kapaliysa (bulut surumu) ComfyUI yollari kullanilamaz: yerlesim varsa
  // kompozisyona dusulur, yoksa aci "comfy" olarak kalir ve is acilirken
  // anlasilir bir hatayla reddedilir (bkz. resolveJobSpec).
  if (!AI_ENABLED) return placement ? 'composite' : 'comfy';

  if (method !== 'auto') return method;
  if (materialDefault !== 'auto') return materialDefault;
  return placement ? 'composite' : 'comfy';
}

async function resolveTemplates(material: Material): Promise<ResolvedMaterial> {
  const dir = templateDir(material.id);

  const declared: ResolvedTemplate[] = await Promise.all(
    material.templates.map(async (t) => {
      const file = path.basename(t.file);
      const key = `${dir}/${file}`;
      const [placement, stat] = await Promise.all([
        readPlacement(material.id, file),
        storage.stat(key),
      ]);
      return {
        ...t,
        materialId: material.id,
        path: key,
        exists: stat.exists,
        mtime: stat.mtime,
        autoDiscovered: false,
        placement,
        resolvedMethod: resolveMethod(t.method, material.defaultMethod, placement),
      };
    }),
  );

  const declaredFiles = new Set(declared.map((t) => path.basename(t.file).toLowerCase()));
  const onDisk = (await storage.list(dir)).filter((f) =>
    IMAGE_EXT.has(path.extname(f).toLowerCase()),
  );

  const discovered: ResolvedTemplate[] = await Promise.all(
    onDisk
      .filter((f) => !declaredFiles.has(f.toLowerCase()))
      .sort()
      .map(async (f) => {
        const [placement, stat] = await Promise.all([
          readPlacement(material.id, f),
          storage.stat(`${dir}/${f}`),
        ]);
        return {
          id: path.basename(f, path.extname(f)).toLowerCase().replace(/[^a-z0-9_-]+/g, '-'),
          label: labelFromFilename(f),
          file: f,
          method: 'auto' as const,
          prompt: '',
          overrides: {},
          materialId: material.id,
          path: `${dir}/${f}`,
          exists: stat.exists,
          mtime: stat.mtime,
          autoDiscovered: true,
          placement,
          resolvedMethod: resolveMethod('auto', material.defaultMethod, placement),
        };
      }),
  );

  return { ...material, templates: [...declared, ...discovered] };
}

/** Belirli bir (materyal, sablon) ciftini ve efektif ayarlarini dondurur. */
export async function resolveJobSpec(materialId: string, templateId: string) {
  const material = await loadMaterial(materialId);
  if (!material) throw new Error(`Materyal bulunamadı: ${materialId}`);

  const template = material.templates.find((t) => t.id === templateId);
  if (!template) throw new Error(`Şablon bulunamadı: ${materialId}/${templateId}`);
  if (!template.exists) {
    throw new Error(`Şablon görseli bulunamadı: ${template.path}`);
  }
  if (!AI_ENABLED && template.resolvedMethod === 'comfy') {
    throw new Error(
      `${material.label} / ${template.label} için yerleşim tanımlı değil. Bu sürümde mockup'lar ` +
        'yalnızca kompozisyonla üretiliyor; Şablonlar sayfasından bu açının yerleşimini ayarlayın.',
    );
  }

  const d = material.defaults;
  const o = template.overrides;

  return {
    material,
    template,
    workflow: material.workflow,
    prompt: [material.basePrompt, template.prompt].filter(Boolean).join(' ').trim(),
    negativePrompt: o.negativePrompt ?? d.negativePrompt,
    width: o.width ?? d.width,
    height: o.height ?? d.height,
    steps: o.steps ?? d.steps,
    cfg: o.cfg ?? d.cfg,
    sampler: o.sampler ?? d.sampler,
    scheduler: o.scheduler ?? d.scheduler,
    shift: o.shift ?? d.shift,
  };
}

export type JobSpec = Awaited<ReturnType<typeof resolveJobSpec>>;
