'use client';

import type { VariantDTO } from '@/lib/types';
import { Button, Card, Input } from './ui';

export interface VariantRow {
  size: string;
  sku: string;
  price: string;
  compareAtPrice: string;
}

export function toRows(variants: VariantDTO[]): VariantRow[] {
  return variants.map((v) => ({
    size: v.size,
    sku: v.sku,
    price: v.price,
    compareAtPrice: v.compareAtPrice ?? '',
  }));
}

const EMPTY: VariantRow = { size: '', sku: '', price: '', compareAtPrice: '' };

/**
 * Adim 4 — sinirsiz varyasyon. Her satirin kendi olcusu, SKU'su ve
 * AYRI FIYATI var; Shopify'a birebir bu sekilde gonderilir.
 * SKU bos birakilirsa kaydederken otomatik uretilir.
 */
export function VariantTable({
  rows,
  onChange,
  disabled,
}: {
  rows: VariantRow[];
  onChange: (rows: VariantRow[]) => void;
  disabled?: boolean;
}) {
  function update(index: number, patch: Partial<VariantRow>) {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function add() {
    onChange([...rows, { ...EMPTY }]);
  }

  function remove(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  function duplicate(index: number) {
    const copy = { ...rows[index], sku: '' };
    onChange([...rows.slice(0, index + 1), copy, ...rows.slice(index + 1)]);
  }

  return (
    <Card
      title="4. Varyasyonlar"
      hint="Her varyasyonun kendi ölçüsü, SKU'su ve fiyatı olur. SKU boş bırakılırsa otomatik üretilir."
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs text-neutral-500">
              <th className="pb-2 pr-3 font-medium">Ölçü *</th>
              <th className="pb-2 pr-3 font-medium">SKU</th>
              <th className="pb-2 pr-3 font-medium">Fiyat *</th>
              <th className="pb-2 pr-3 font-medium">Karşılaştırma fiyatı</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td className="py-1 pr-3">
                  <Input
                    value={row.size}
                    onChange={(e) => update(i, { size: e.target.value })}
                    placeholder="30x40 cm"
                    disabled={disabled}
                  />
                </td>
                <td className="py-1 pr-3">
                  <Input
                    value={row.sku}
                    onChange={(e) => update(i, { sku: e.target.value })}
                    placeholder="otomatik"
                    disabled={disabled}
                  />
                </td>
                <td className="py-1 pr-3">
                  <Input
                    value={row.price}
                    onChange={(e) => update(i, { price: e.target.value })}
                    placeholder="1499.90"
                    inputMode="decimal"
                    disabled={disabled}
                  />
                </td>
                <td className="py-1 pr-3">
                  <Input
                    value={row.compareAtPrice}
                    onChange={(e) => update(i, { compareAtPrice: e.target.value })}
                    placeholder="—"
                    inputMode="decimal"
                    disabled={disabled}
                  />
                </td>
                <td className="whitespace-nowrap py-1 text-right">
                  <button
                    type="button"
                    onClick={() => duplicate(i)}
                    disabled={disabled}
                    title="Kopyala"
                    className="px-2 text-xs text-neutral-500 hover:text-neutral-200 disabled:opacity-40"
                  >
                    kopyala
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    disabled={disabled || rows.length === 1}
                    title="Sil"
                    className="px-2 text-xs text-neutral-500 hover:text-red-400 disabled:opacity-30"
                  >
                    sil
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3">
        <Button type="button" variant="ghost" onClick={add} disabled={disabled}>
          + Varyasyon ekle
        </Button>
      </div>
    </Card>
  );
}
