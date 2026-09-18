import Link from 'next/link';
import { BoardWizard } from '@/components/BoardWizard';

export const dynamic = 'force-dynamic';

export default function BoardPage() {
  return (
    <main className="space-y-6">
      <nav className="text-xs text-neutral-500">
        <Link href="/" className="hover:text-neutral-300">
          ← Ana sayfa
        </Link>
      </nav>
      <BoardWizard />
    </main>
  );
}
