import { NextResponse } from 'next/server';
import { loadMaterials } from '@/lib/registry/materials';

export const dynamic = 'force-dynamic';

/** UI'in materyal ve aci secimi icin kullandigi liste. */
export async function GET() {
  try {
    const materials = await loadMaterials();
    return NextResponse.json({
      materials: materials.map((m) => ({
        id: m.id,
        label: m.label,
        shopifyTag: m.shopifyTag,
        reflective: m.reflective,
        vendor: m.vendor,
        productType: m.productType,
        tags: m.tags,
        optionName: m.optionName,
        sizes: m.sizes,
        templates: m.templates.map((t) => ({
          id: t.id,
          label: t.label,
          file: t.file,
          path: t.path,
          exists: t.exists,
          mtime: t.mtime,
          autoDiscovered: t.autoDiscovered,
          hasPlacement: t.placement !== null,
          method: t.resolvedMethod,
        })),
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
