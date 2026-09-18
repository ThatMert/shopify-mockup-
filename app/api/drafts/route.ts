import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { prepareDesign, saveSource } from '@/lib/image/pipeline';
import { downloadPinImage, resolvePin } from '@/lib/source/pinterest';

export const dynamic = 'force-dynamic';

/**
 * Yeni taslak olusturur. Iki kaynak destekli:
 *  - multipart form + "file"      -> manuel yukleme
 *  - multipart form + "pinterestUrl" -> Pinterest pin'inden cekme
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const pinterestUrl = String(form.get('pinterestUrl') ?? '').trim();
    const file = form.get('file');

    let buffer: Buffer;
    let sourceType: 'pinterest' | 'upload';
    let sourceUrl: string | null = null;
    let suggestedTitle = '';

    if (file instanceof File && file.size > 0) {
      buffer = Buffer.from(await file.arrayBuffer());
      sourceType = 'upload';
      suggestedTitle = file.name.replace(/\.[^.]+$/, '');
    } else if (pinterestUrl) {
      const pin = await resolvePin(pinterestUrl);
      buffer = await downloadPinImage(pin);
      sourceType = 'pinterest';
      sourceUrl = pin.pageUrl;
      suggestedTitle = pin.title ?? '';
    } else {
      return NextResponse.json(
        { error: 'Pinterest URL veya bir görsel dosyası gerekli' },
        { status: 400 },
      );
    }

    const draft = await prisma.draft.create({
      data: { sourceType, sourceUrl, title: suggestedTitle.slice(0, 200) },
    });

    // Kaynak + on islenmis tasarim diske yazilir.
    const source = await saveSource(buffer, draft.id);
    const design = await prepareDesign(source.path, draft.id);

    const updated = await prisma.draft.update({
      where: { id: draft.id },
      data: { sourcePath: source.path, designPath: design.path },
    });

    await prisma.asset.createMany({
      data: [
        { draftId: draft.id, path: source.path, kind: 'source', width: source.width, height: source.height, selected: false },
        { draftId: draft.id, path: design.path, kind: 'design', width: design.width, height: design.height, selected: false },
      ],
    });

    return NextResponse.json({ draft: updated, design });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}

/** Taslak listesi. */
export async function GET() {
  const drafts = await prisma.draft.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 50,
    include: { _count: { select: { variants: true, assets: true, jobs: true } } },
  });
  return NextResponse.json({ drafts });
}
