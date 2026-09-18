'use client';

import { useEffect, useState } from 'react';
import type { MaterialDTO } from '@/lib/types';
import { fileUrl } from '@/lib/types';
import { Card, ErrorBox } from './ui';

/** Bir materyal ve o materyalden uretilecek acilar. */
export interface MaterialSelection {
  materialId: string;
  templateIds: string[];
}

/**
 * Adim 2-3 — ürün materyali (çoklu) ve her materyal için açı seçimi.
 *
 * Materyal secildiginde acilari ve sabit olcu/fiyat tablosu acilir; tablo
 * config/materials/<id>.json'dan gelir ve inceleme ekraninda uygulanir.
 */
export function MaterialAnglePicker({
  value,
  onChange,
  disabled,
}: {
  value: MaterialSelection[];
  onChange: (next: MaterialSelection[]) => void;
  disabled?: boolean;
}) {
  const [materials, setMaterials] = useState<MaterialDTO[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/materials')
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error);
        else setMaterials(json.materials);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  const selectionOf = (materialId: string) => value.find((s) => s.materialId === materialId);

  /** Materyali ac/kapa. Ilk acilista diskte gorseli olan tum acilar secili gelir. */
  function toggleMaterial(material: MaterialDTO) {
    const current = selectionOf(material.id);
    if (current) {
      onChange(value.filter((s) => s.materialId !== material.id));
      return;
    }
    const available = material.templates.filter((t) => t.exists).map((t) => t.id);
    onChange([...value, { materialId: material.id, templateIds: available.slice(0, 3) }]);
  }

  function toggleAngle(materialId: string, templateId: string) {
    onChange(
      value.map((s) => {
        if (s.materialId !== materialId) return s;
        const has = s.templateIds.includes(templateId);
        return {
          ...s,
          templateIds: has
            ? s.templateIds.filter((id) => id !== templateId)
            : [...s.templateIds, templateId],
        };
      }),
    );
  }

  return (
    <Card
      title="2. Ürün tipi ve açılar"
      hint="Aynı tasarım birden fazla materyalde mockuplanabilir. Her (tasarım × materyal × açı) ayrı bir iş olur."
    >
      {loading && <p className="text-sm text-neutral-500">Materyaller yükleniyor…</p>}
      <ErrorBox>{error}</ErrorBox>

      <div className="space-y-4">
        {materials.map((material) => {
          const selection = selectionOf(material.id);
          const usable = material.templates.filter((t) => t.exists);
          const noSizes = material.sizes.length === 0;

          return (
            <div
              key={material.id}
              className={`rounded-md border p-3 transition ${
                selection ? 'border-emerald-600/70 bg-emerald-950/10' : 'border-neutral-800'
              }`}
            >
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={Boolean(selection)}
                  onChange={() => toggleMaterial(material)}
                  disabled={disabled || usable.length === 0 || noSizes}
                  className="h-4 w-4 accent-emerald-500"
                />
                <span className="text-sm text-neutral-200">
                  {material.productType || material.label}
                </span>
                <span className="text-xs text-neutral-500">
                  {material.sizes.length} ölçü
                  {material.reflective ? ' · yansımalı' : ''}
                </span>
                {usable.length === 0 && (
                  <span className="text-xs text-amber-500">
                    şablon görseli yok —{' '}
                    <a href="/templates" className="underline">
                      yükleyin
                    </a>
                  </span>
                )}
                {noSizes && usable.length > 0 && (
                  <span className="text-xs text-amber-500">
                    ölçü/fiyat tablosu tanımlı değil (config/materials/{material.id}.json)
                  </span>
                )}
              </label>

              {selection && (
                <div className="mt-3 grid gap-4 border-t border-neutral-800 pt-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                  <div>
                    <p className="mb-2 text-xs text-neutral-500">
                      Açılar ({selection.templateIds.length} seçili)
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {material.templates.map((template) => {
                        const on = selection.templateIds.includes(template.id);
                        return (
                          <button
                            key={template.id}
                            type="button"
                            disabled={disabled || !template.exists}
                            onClick={() => toggleAngle(material.id, template.id)}
                            className={`overflow-hidden rounded border text-left transition disabled:cursor-not-allowed ${
                              !template.exists
                                ? 'border-neutral-800 opacity-40'
                                : on
                                  ? 'border-emerald-500'
                                  : 'border-neutral-800 hover:border-neutral-600'
                            }`}
                          >
                            <div className="aspect-square bg-neutral-950">
                              {template.exists ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={fileUrl(template.path, template.mtime, 480)}
                                  alt={template.label}
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="flex h-full items-center justify-center px-1 text-center text-[10px] text-neutral-600">
                                  görsel eksik
                                </div>
                              )}
                            </div>
                            <div className="flex items-center justify-between px-1.5 py-1 text-[11px]">
                              <span className={on ? 'text-emerald-400' : 'text-neutral-400'}>
                                {template.label}
                              </span>
                              <span
                                className="text-[9px] text-neutral-600"
                                title={
                                  template.method === 'comfy'
                                    ? 'ComfyUI ile üretilir (yavaş)'
                                    : template.method === 'composite+harmonize'
                                      ? 'Kompozisyon + AI rötuş'
                                      : 'Anında kompozisyon'
                                }
                              >
                                {template.method === 'comfy'
                                  ? '◷'
                                  : template.method === 'composite+harmonize'
                                    ? '✦'
                                    : '⚡'}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <a
                      href="/templates"
                      className="mt-2 inline-block text-xs text-neutral-500 underline hover:text-neutral-300"
                    >
                      şablonu değiştir / yerleşimi düzenle →
                    </a>
                  </div>

                  <div>
                    <p className="mb-2 text-xs text-neutral-500">Sabit ölçü ve fiyatlar</p>
                    <ul className="space-y-1 text-xs">
                      {material.sizes.map((s) => (
                        <li
                          key={s.size}
                          className="flex justify-between gap-2 border-b border-neutral-900 pb-1"
                        >
                          <span className="text-neutral-400">{s.size}</span>
                          <span className="shrink-0 text-neutral-200">{s.price} ₺</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
