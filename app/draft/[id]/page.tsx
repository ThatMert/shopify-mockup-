import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DraftWorkspace } from '@/components/DraftWorkspace';
import { prisma } from '@/lib/db';
import { toDraftDTO } from '@/lib/dto';
import type { DraftDTO } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const draft = await prisma.draft.findUnique({
    where: { id },
    include: {
      variants: { orderBy: { position: 'asc' } },
      jobs: { orderBy: { createdAt: 'asc' } },
      assets: { orderBy: { position: 'asc' } },
    },
  });
  if (!draft) notFound();

  // Prisma Date alanlari client bilesenine gecemez; paylasilan serilestiriciyi kullan.
  const dto: DraftDTO = toDraftDTO(draft);

  return (
    <main className="space-y-6">
      <nav className="text-xs text-neutral-500">
        <Link href="/" className="hover:text-neutral-300">
          ← Taslaklar
        </Link>
      </nav>
      <DraftWorkspace initial={dto} />
    </main>
  );
}
