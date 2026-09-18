'use client';

import { useEffect, useState } from 'react';
import type { MaterialDTO } from '@/lib/types';
import { fileUrl } from '@/lib/types';
import { Button, Card, ErrorBox } from './ui';

export interface Selection {
  materialId: string;
  templateId: string;
  count: number;
}

const key = (m: string, t: string) => `${m}/${t}`;

/**
 * Adim 2 — hangi materyallerin hangi acilarindan mockup uretilecegi.
 * Materyaller config/materials/*.json'dan gelir; sablon gorseli diskte
 * olmayan aci secilemez ve nedeni gosterilir.
 */
export function MaterialPicker({
  onGenerate,
  busy,
}: {
  onGenerate: (selections: Selection[]) => Promise<void>;
  busy: boolean;
}) {
  const [materials, setMaterials] = useState<MaterialDTO[]>([]);
  const [selected, setSelected] = useState<Map<string, number>>(new Map());
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

  function toggle(materialId: string, templateId: string) {
    const k = key(materialId, templateId);
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(k)) next.delete(k);
      else next.set(k, 1);
      return next;
    });
  }

  function setCount(materialId: string, templateId: string, count: number) {
    const k = key(materialId, templateId);
    setSelected((prev) => new Map(prev).set(k, count));
  }

  const selections: Selection[] = [...selected.entries()].map(([k, count]) => {
    const [materialId, templateId] = k.split('/');
    return { materialId, templateId, count };
  });

  const totalImages = selections.reduce((n, s) => n + s.count, 0);

  return (
    <Card
      title="2. Materyal ve açı seçimi"
      hint="Her seçim ayrı bir ComfyUI işi olur. Aynı açıdan birden fazla varyant üretebilirsiniz."
    >
      {loading && <p className="text-sm text-neutral-500">Materyaller yükleniyor…</p>}
      <ErrorBox>{error}</ErrorBox>

      <div className="space-y-5">
        {materials.map((material) => (
          <div key={material.id}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
              {material.label}
            </h3>

            {material.templates.length === 0 ? (
              <p className="text-xs text-neutral-600">
                Şablon yok —{' '}
                <a href="/templates" className="text-neutral-400 underline hover:text-emerald-400">
                  Şablonları yönet
                </a>{' '}
                sayfasından mockup görselleri yükleyin.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {material.templates.map((template) => {
                  const k = key(material.id, template.id);
                  const isSelected = selected.has(k);
                  return (
                    <div
                      key={k}
                      className={`overflow-hidden rounded-md border transition ${
                        !template.exists
                          ? 'border-neutral-800 opacity-40'
                          : isSelected
                            ? 'border-emerald-500'
                            : 'border-neutral-800 hover:border-neutral-600'
                      }`}
                    >
                      <button
                        type="button"
                        disabled={!template.exists || busy}
                        onClick={() => toggle(material.id, template.id)}
                        className="block w-full text-left disabled:cursor-not-allowed"
                      >
                        <div className="aspect-square bg-neutral-950">
                          {template.exists ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={fileUrl(template.path, template.mtime, 480)}
                              alt={template.label}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center px-2 text-center text-[10px] text-neutral-600">
                              görsel eksik
                            </div>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-1 px-2 py-1.5 text-xs">
                          <span className={isSelected ? 'text-emerald-400' : 'text-neutral-300'}>
                            {template.label}
                          </span>
                          {template.exists && (
                            <span
                              className="shrink-0 text-[9px] text-neutral-600"
                              title={
                                template.method === 'composite'
                                  ? 'Anında kompozisyon'
                                  : 'ComfyUI ile üretilir (yavaş)'
                              }
                            >
                              {template.method === 'composite' ? '⚡' : '◷'}
                            </span>
                          )}
                        </div>
                      </button>

                      {isSelected && (
                        <div className="flex items-center gap-1 border-t border-neutral-800 px-2 py-1.5">
                          <span className="text-[10px] text-neutral-500">adet</span>
                          {[1, 2, 3].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setCount(material.id, template.id, n)}
                              className={`h-5 w-5 rounded text-[10px] ${
                                selected.get(k) === n
                                  ? 'bg-emerald-500 text-neutral-950'
                                  : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-neutral-800 pt-4">
        <Button
          type="button"
          disabled={busy || selections.length === 0}
          onClick={() => onGenerate(selections)}
        >
          {busy ? 'Üretiliyor…' : `Mockup üret (${totalImages} görsel)`}
        </Button>
        <span className="text-xs text-neutral-500">
          {selections.length} seçim · tek GPU için sırayla işlenir
        </span>
        <a
          href="/templates"
          className="ml-auto text-xs text-neutral-500 underline hover:text-neutral-300"
        >
          Şablonları yönet →
        </a>
      </div>
    </Card>
  );
}
