import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BatchWorkspace } from '@/components/BatchWorkspace';
import { prisma } from '@/lib/db';
import { toBatchDTO } from '@/lib/dto';

export const dynamic = 'force-dynamic';

export default async function BatchPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;

  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: {
      pins: { orderBy: { position: 'asc' } },
      drafts: {
        orderBy: { createdAt: 'asc' },
        include: {
          variants: { orderBy: { position: 'asc' } },
          jobs: { orderBy: { createdAt: 'asc' } },
          assets: { orderBy: { position: 'asc' } },
        },
      },
    },
  });
  if (!batch) notFound();

  return (
    <main className="space-y-6">
      <nav className="text-xs text-neutral-500">
        <Link href="/board" className="hover:text-neutral-300">
          ← Yeni koleksiyon
        </Link>
      </nav>
      <BatchWorkspace initial={toBatchDTO(batch)} />
    </main>
  );
}
