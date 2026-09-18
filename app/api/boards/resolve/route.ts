import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { toPinDTO } from '@/lib/dto';
import { fetchBoardPins } from '@/lib/source/board';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  boardUrl: z.string().min(3),
  /** Ayni board tekrar cozumlenirse yeni batch acmak yerine mevcudu yenile. */
  batchId: z.string().optional(),
});

/**
 * Adim 1 — board'daki pinleri listeler.
 *
 * Gorsel indirilmez; sadece Batch + Pin kayitlari olusturulur, kullanici
 * grid'den secim yapinca POST /api/batches indirmeyi baslatir.
 */
export async function POST(req: NextRequest) {
  try {
    const { boardUrl, batchId } = bodySchema.parse(await req.json());
    const board = await fetchBoardPins(boardUrl);

    const batch = batchId
      ? await prisma.batch.update({
          where: { id: batchId },
          data: {
            boardUrl: board.boardUrl,
            boardId: board.boardId,
            boardName: board.boardName,
            source: board.source,
          },
        })
      : await prisma.batch.create({
          data: {
            boardUrl: board.boardUrl,
            boardId: board.boardId,
            boardName: board.boardName,
            source: board.source,
          },
        });

    // Ayni pin tekrar gelirse (yenileme) gorsel adresi guncellenir, secim korunur.
    for (const [index, pin] of board.pins.entries()) {
      await prisma.pin.upsert({
        where: { batchId_pinId: { batchId: batch.id, pinId: pin.pinId } },
        create: {
          batchId: batch.id,
          pinId: pin.pinId,
          pinUrl: pin.pinUrl,
          thumbUrl: pin.thumbUrl,
          imageUrl: pin.imageUrl,
          note: pin.note,
          position: index,
        },
        update: {
          thumbUrl: pin.thumbUrl,
          imageUrl: pin.imageUrl,
          note: pin.note,
          position: index,
        },
      });
    }

    const pins = await prisma.pin.findMany({
      where: { batchId: batch.id },
      orderBy: { position: 'asc' },
    });

    return NextResponse.json({
      batch: {
        id: batch.id,
        boardUrl: batch.boardUrl,
        boardName: batch.boardName,
        source: batch.source,
        status: batch.status,
      },
      pins: pins.map(toPinDTO),
      partial: board.partial,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
