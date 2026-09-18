import 'server-only';
import path from 'node:path';
import { storage } from '@/lib/storage';
import { placementSchema, placementFileFor, type Placement } from './placement';

/**
 * Yerlesim verisi sablon gorseliyle ayni klasorde, yaninda yasar:
 *   storage/templates/<materyal>/<ad>.png
 *   storage/templates/<materyal>/<ad>.placement.json
 *
 * Boylece bir sablonu kopyalayip tasidiginizda ayarlari da beraberinde gider
 * ve materyal JSON'unu elle duzenlemek gerekmez.
 */

function placementPath(materialId: string, templateFile: string): string {
  return `storage/templates/${materialId}/${placementFileFor(path.basename(templateFile))}`;
}

/** Kayitli yerlesimi okur; yoksa veya bozuksa null doner. */
export async function readPlacement(
  materialId: string,
  templateFile: string,
): Promise<Placement | null> {
  try {
    const file = await storage.read(placementPath(materialId, templateFile));
    if (!file) return null;
    return placementSchema.parse(JSON.parse(file.data.toString('utf8')));
  } catch {
    return null;
  }
}

/** Yerlesimi diske yazar. */
export async function writePlacement(
  materialId: string,
  templateFile: string,
  placement: Placement,
): Promise<void> {
  await storage.write(
    placementPath(materialId, templateFile),
    Buffer.from(JSON.stringify(placement, null, 2), 'utf8'),
  );
}

/** Sablon silindiginde yaninda kalan yerlesim dosyasini da temizler. */
export async function deletePlacement(materialId: string, templateFile: string): Promise<void> {
  await storage.delete(placementPath(materialId, templateFile));
}
