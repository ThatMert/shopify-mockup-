import path from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { placementSchema, DEFAULT_PLACEMENT } from '@/lib/mockup/placement';
import { readPlacement, writePlacement, deletePlacement } from '@/lib/mockup/store';
import { invalidateMaterials, loadMaterial } from '@/lib/registry/materials';

export const dynamic = 'force-dynamic';

const SAFE_NAME = /^[a-zA-Z0-9._-]+$/;

/** Sorgu parametrelerini dogrular; materyalin var oldugundan emin olur. */
async function resolveTarget(req: NextRequest): Promise<{ materialId: string; filename: string }> {
  const materialId = req.nextUrl.searchParams.get('materialId') ?? '';
  const filename = path.basename(req.nextUrl.searchParams.get('filename') ?? '');

  if (!SAFE_NAME.test(filename)) throw new Error('Geçersiz dosya adı');
  const material = await loadMaterial(materialId);
  if (!material) throw new Error(`Materyal bulunamadı: ${materialId}`);

  return { materialId, filename };
}

/** Kayitli yerlesimi dondurur; yoksa varsayilani (isDefault: true ile). */
export async function GET(req: NextRequest) {
  try {
    const { materialId, filename } = await resolveTarget(req);
    const placement = await readPlacement(materialId, filename);
    return NextResponse.json({
      placement: placement ?? DEFAULT_PLACEMENT,
      isDefault: placement === null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}

const putSchema = z.object({ placement: placementSchema });

/** Yerlesimi kaydeder. */
export async function PUT(req: NextRequest) {
  try {
    const { materialId, filename } = await resolveTarget(req);
    const { placement } = putSchema.parse(await req.json());
    await writePlacement(materialId, filename, placement);
    invalidateMaterials();
    return NextResponse.json({ ok: true, placement });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}

/** Yerlesimi siler; sablon tekrar ComfyUI yoluna duser. */
export async function DELETE(req: NextRequest) {
  try {
    const { materialId, filename } = await resolveTarget(req);
    await deletePlacement(materialId, filename);
    invalidateMaterials();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
