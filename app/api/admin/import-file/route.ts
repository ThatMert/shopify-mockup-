import { NextResponse, type NextRequest } from 'next/server';
import { invalidateMaterials } from '@/lib/registry/materials';
import { normalizeKey, storage } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/** Aktarima izin verilen klasorler. */
const ALLOWED_PREFIXES = ['storage/templates/'];

/**
 * Tek bir dosyayi depoya yazar (yerelden buluta tasima icin).
 * Erisim: oturum cerezi veya middleware'deki tek seferlik IMPORT_TOKEN.
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const key = normalizeKey(String(form.get('key') ?? ''));
    const file = form.get('file');

    if (!ALLOWED_PREFIXES.some((p) => key.startsWith(p))) {
      return NextResponse.json({ error: `Bu klasöre aktarım yapılamaz: ${key}` }, { status: 400 });
    }
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: 'Dosya gerekli' }, { status: 400 });
    }

    const { mtime } = await storage.write(key, Buffer.from(await file.arrayBuffer()));
    invalidateMaterials();
    return NextResponse.json({ ok: true, key, bytes: file.size, mtime });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
