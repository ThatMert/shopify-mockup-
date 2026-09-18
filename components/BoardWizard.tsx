'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BoardPicker, type ResolvedBoard } from './BoardPicker';
import { MaterialAnglePicker, type MaterialSelection } from './MaterialAnglePicker';
import { Button, ErrorBox } from './ui';

/**
 * Toplu uretim sihirbazinin ilk uc adimi: board secimi, materyal ve aci
 * secimi, ardindan uretimin baslatilmasi. Uretim baslayinca kullanici
 * /board/<batchId> ilerleme + inceleme ekranina gecer.
 */
export function BoardWizard() {
  const router = useRouter();
  const [board, setBoard] = useState<ResolvedBoard | null>(null);
  const [selectedPins, setSelectedPins] = useState<Set<string>>(new Set());
  const [materials, setMaterials] = useState<MaterialSelection[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const angleCount = materials.reduce((n, m) => n + m.templateIds.length, 0);
  const jobCount = selectedPins.size * angleCount;
  const productCount = selectedPins.size * materials.length;

  async function start() {
    setError('');
    setBusy(true);
    try {
      // Bulutta tek istek 60 sn ile sinirli; cok pinli board'larda sunucu
      // indirebildigi kadarini isleyip `remainingPins` doner. Ayni istek
      // tekrarlandiginda islenmis pinler atlanir.
      let remainingPins = 1;
      for (let round = 0; remainingPins > 0 && round < 20; round++) {
        const res = await fetch('/api/batches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            batchId: board!.batchId,
            pinIds: [...selectedPins],
            materials,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);

        if (json.failedPins?.length > 0) {
          console.warn('[board] indirilemeyen pinler:', json.failedPins);
        }
        remainingPins = json.remainingPins ?? 0;
        window.dispatchEvent(new Event('queue:kick'));
      }
      router.push(`/board/${board!.batchId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <BoardPicker
        board={board}
        onResolved={setBoard}
        selected={selectedPins}
        onSelectedChange={setSelectedPins}
        disabled={busy}
      />

      {selectedPins.size > 0 && (
        <MaterialAnglePicker value={materials} onChange={setMaterials} disabled={busy} />
      )}

      {selectedPins.size > 0 && (
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-neutral-800 bg-neutral-900/40 p-5">
          <Button
            type="button"
            onClick={() => void start()}
            disabled={busy || jobCount === 0 || !board}
          >
            {busy ? 'Başlatılıyor…' : `Seçilenleri al ve mockup üret (${jobCount} iş)`}
          </Button>
          <span className="text-xs text-neutral-500">
            {selectedPins.size} tasarım × {materials.length} materyal = {productCount} ürün ·{' '}
            {jobCount} mockup · tek GPU için sırayla işlenir
          </span>
          <div className="w-full">
            <ErrorBox>{error}</ErrorBox>
          </div>
        </div>
      )}
    </div>
  );
}
