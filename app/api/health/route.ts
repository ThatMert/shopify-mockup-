import { NextResponse, type NextRequest } from 'next/server';
import { checkComfy, COMFY_URL } from '@/lib/comfy/client';
import { loadWorkflow } from '@/lib/comfy/graph';
import { findMissingModels } from '@/lib/comfy/validate';
import { refreshAccessToken } from '@/lib/shopify/client';
import { checkShopify } from '@/lib/shopify/publish';
import { loadMaterials } from '@/lib/registry/materials';
import { queueStatus } from '@/lib/comfy/queue';
import { AI_ENABLED, IS_CLOUD } from '@/lib/runtime';

export const dynamic = 'force-dynamic';

/**
 * Kurulumun dogru olup olmadigini tek bakista gosteren saglik kontrolu.
 *
 * `?refresh=1` onbellekteki Shopify token'ini atar: Dev Dashboard'da yeni
 * izinlerle bir surum yayinladiktan sonra sunucuyu yeniden baslatmadan
 * token'i (ve izinleri) tazelemek icin.
 */
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('refresh')) refreshAccessToken();

  // Bulut surumunde ComfyUI yok; baglanmayi denemek her kontrolu yavaslatirdi.
  const [comfy, shopify] = await Promise.all([
    AI_ENABLED
      ? checkComfy()
      : Promise.resolve({ ok: false, detail: 'Bu sürümde AI (ComfyUI) kapalı' }),
    checkShopify(),
  ]);

  let materials: { ok: boolean; detail: string; missingTemplates: string[] };
  try {
    const loaded = await loadMaterials();
    const missing = loaded.flatMap((m) =>
      m.templates.filter((t) => !t.exists).map((t) => `${m.id}/${t.file}`),
    );
    const ready = loaded.reduce((n, m) => n + m.templates.filter((t) => t.exists).length, 0);
    materials = {
      ok: ready > 0,
      detail: `${loaded.length} materyal, ${ready} kullanılabilir şablon`,
      missingTemplates: missing,
    };
  } catch (err) {
    materials = {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
      missingTemplates: [],
    };
  }

  // Materyallerin kullandigi her workflow icin model dosyalarini dogrula.
  const workflows: Record<string, string[]> = {};
  if (AI_ENABLED && comfy.ok) {
    try {
      const names = [...new Set((await loadMaterials()).map((m) => m.workflow))];
      for (const name of names) {
        const missing = await findMissingModels(await loadWorkflow(name));
        workflows[name] = missing.map((m) => `${m.value} → ${m.folder}`);
      }
    } catch {
      // Materyal veya workflow okunamadiysa yukaridaki materials bolumu zaten bildiriyor.
    }
  }

  return NextResponse.json({
    mode: IS_CLOUD ? 'cloud' : 'local',
    aiEnabled: AI_ENABLED,
    comfy: { ...comfy, url: COMFY_URL },
    eksikModeller: workflows,
    shopify,
    materials,
    queue: await queueStatus(),
  });
}
