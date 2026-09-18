'use client';

import { useState } from 'react';
import type { PinDTO } from '@/lib/types';
import { Button, Card, ErrorBox, Input } from './ui';

export interface ResolvedBoard {
  batchId: string;
  boardName: string;
  source: 'api' | 'scrape';
  partial: boolean;
  pins: PinDTO[];
}

/**
 * Adim 1 — Pinterest koleksiyonu (board) ve tasarim secimi.
 *
 * Karta tiklamak pinin Pinterest sayfasini yeni sekmede acar; secim ise
 * kartin ustundeki ayri kutucukla yapilir. Ikisi birbirine karismaz: kutucuk
 * bagin uzerinde ayri bir katman olarak durur ve tiklamayi yaymaz.
 */
export function BoardPicker({
  board,
  onResolved,
  selected,
  onSelectedChange,
  disabled,
}: {
  board: ResolvedBoard | null;
  onResolved: (board: ResolvedBoard) => void;
  selected: Set<string>;
  onSelectedChange: (next: Set<string>) => void;
  disabled?: boolean;
}) {
  const [boardUrl, setBoardUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function resolve() {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/boards/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardUrl, batchId: board?.batchId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      onResolved({
        batchId: json.batch.id,
        boardName: json.batch.boardName,
        source: json.batch.source,
        partial: json.partial,
        pins: json.pins,
      });
      onSelectedChange(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function toggle(pinId: string) {
    const next = new Set(selected);
    if (next.has(pinId)) next.delete(pinId);
    else next.add(pinId);
    onSelectedChange(next);
  }

  const pins = board?.pins ?? [];
  const allSelected = pins.length > 0 && selected.size === pins.length;

  return (
    <Card
      title="1. Pinterest koleksiyonu"
      hint="Board bağlantısını yapıştırın. Küçük görsele tıklamak pini Pinterest'te açar; seçim sağ üstteki kutucukla yapılır."
    >
      <div className="flex flex-wrap gap-3">
        <Input
          value={boardUrl}
          onChange={(e) => setBoardUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !loading) void resolve();
          }}
          placeholder="https://www.pinterest.com/kullanici/koleksiyon/"
          className="min-w-[280px] flex-1"
          disabled={loading || disabled}
        />
        <Button type="button" onClick={() => void resolve()} disabled={loading || !boardUrl.trim()}>
          {loading ? 'Pinler alınıyor…' : board ? 'Yenile' : 'Pinleri getir'}
        </Button>
      </div>

      <div className="mt-3">
        <ErrorBox>{error}</ErrorBox>
      </div>

      {board && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-neutral-800 pt-4 text-xs text-neutral-500">
            <span className="text-neutral-300">{board.boardName}</span>
            <span>{pins.length} pin</span>
            <span
              className="rounded bg-neutral-800 px-1.5 py-0.5"
              title={
                board.source === 'api'
                  ? 'Resmî Pinterest API ile alındı'
                  : 'Board sayfasından okundu (token yok)'
              }
            >
              {board.source === 'api' ? 'API' : 'sayfa okuma'}
            </span>
            <span className="text-emerald-400">{selected.size} seçili</span>
            <button
              type="button"
              onClick={() =>
                onSelectedChange(allSelected ? new Set() : new Set(pins.map((p) => p.id)))
              }
              className="ml-auto underline hover:text-neutral-300"
            >
              {allSelected ? 'seçimi temizle' : 'tümünü seç'}
            </button>
          </div>

          {board.partial && (
            <p className="mt-3 rounded-md border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
              Bu liste board sayfasından okundu, bu yüzden yalnızca ilk yüklenen pinleri içerir.
              Tüm pinler için <code>PINTEREST_ACCESS_TOKEN</code> tanımlayın.
            </p>
          )}

          <div className="mt-4 columns-2 gap-3 sm:columns-3 lg:columns-4 [&>*]:mb-3">
            {pins.map((pin) => {
              const isSelected = selected.has(pin.id);
              return (
                <div
                  key={pin.id}
                  className={`relative break-inside-avoid overflow-hidden rounded-md border transition ${
                    isSelected ? 'border-emerald-500' : 'border-neutral-800 hover:border-neutral-600'
                  }`}
                >
                  <a href={pin.pinUrl} target="_blank" rel="noreferrer" className="block">
                    {/*
                      Onizleme sunucu uzerinden gecirilir; tarayici i.pinimg.com'a
                      dogrudan gittiginde gorsel bos donebiliyor ve kart cokuyor.
                      min-h ile kart her durumda tiklanabilir yukseklikte kalir.
                    */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/pin-image?url=${encodeURIComponent(pin.thumbUrl)}`}
                      alt={pin.note || 'pin'}
                      className="min-h-[120px] w-full bg-neutral-950 object-cover"
                      loading="lazy"
                    />
                  </a>

                  {/*
                    Secim kutucugu bagin ustunde ayri bir katman; tiklama pine gitmez.
                    Kutucuk bir <label> icine SARILMAZ: label tiklamayi input'a ikinci
                    kez iletiyor ve secim aninda geri aliniyor.
                  */}
                  <div className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded bg-neutral-950/80 backdrop-blur">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(pin.id)}
                      onClick={(e) => e.stopPropagation()}
                      disabled={disabled}
                      className="h-4 w-4 cursor-pointer accent-emerald-500"
                      aria-label={pin.note || `Pin ${pin.pinId}`}
                    />
                  </div>

                  {pin.error && (
                    <p className="px-2 py-1 text-[10px] text-red-400" title={pin.error}>
                      indirilemedi
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}
