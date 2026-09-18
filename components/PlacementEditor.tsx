'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Placement, PlacementPoint } from '@/lib/mockup/placement';
import { DEFAULT_PLACEMENT } from '@/lib/mockup/placement';
import { fileUrl } from '@/lib/types';
import { Button, ErrorBox } from './ui';

const CORNER_LABELS = ['Sol üst', 'Sağ üst', 'Sağ alt', 'Sol alt'];

/**
 * Sablon uzerinde urun yuzeyinin dort kosesini fareyle isaretleme editoru.
 * Sag tarafta kompozisyonun canli onizlemesi gosterilir.
 */
export function PlacementEditor({
  materialId,
  templateFile,
  templatePath,
  templateVersion,
  templateLabel,
  onClose,
  onSaved,
}: {
  materialId: string;
  templateFile: string;
  templatePath: string;
  /** Gorselin mtime'i; cache kirmak icin URL'e eklenir. */
  templateVersion: number;
  templateLabel: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [placement, setPlacement] = useState<Placement>(DEFAULT_PLACEMENT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  // Buyutec, surukleme sirasinda ve klavyeyle ince ayar yaparken gorunur.
  const loupeIndex = dragIndex ?? focusIndex;

  const surfaceRef = useRef<HTMLDivElement>(null);
  // Onizleme isteklerini iptal edebilmek icin son isteğin denetleyicisi.
  const previewAbort = useRef<AbortController | null>(null);

  // --- Kayitli yerlesimi yukle
  useEffect(() => {
    const qs = `materialId=${encodeURIComponent(materialId)}&filename=${encodeURIComponent(templateFile)}`;
    fetch(`/api/templates/placement?${qs}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error);
        else setPlacement(json.placement);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [materialId, templateFile]);

  // --- Onizlemeyi ayarlar degistikce (gecikmeli) yenile
  const refreshPreview = useCallback(
    async (next: Placement) => {
      previewAbort.current?.abort();
      const controller = new AbortController();
      previewAbort.current = controller;

      setPreviewing(true);
      try {
        const res = await fetch('/api/templates/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ materialId, filename: templateFile, placement: next }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({ error: 'Önizleme oluşturulamadı' }));
          throw new Error(json.error);
        }
        const blob = await res.blob();
        setPreviewUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(blob);
        });
        setError('');
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setPreviewing(false);
      }
    },
    [materialId, templateFile],
  );

  useEffect(() => {
    if (loading || dragIndex !== null) return;
    const timer = setTimeout(() => void refreshPreview(placement), 250);
    return () => clearTimeout(timer);
  }, [placement, loading, dragIndex, refreshPreview]);

  // Bilesen kapanirken blob URL'ini birak.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // Yalnizca unmount'ta calismali.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Kose surukleme
  function pointFromEvent(event: { clientX: number; clientY: number }): PlacementPoint | null {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  }

  useEffect(() => {
    if (dragIndex === null) return;

    const move = (event: PointerEvent) => {
      const point = pointFromEvent(event);
      if (!point) return;
      setPlacement((prev) => {
        const corners = [...prev.corners] as Placement['corners'];
        corners[dragIndex] = point;
        return { ...prev, corners };
      });
    };
    const up = () => setDragIndex(null);

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [dragIndex]);

  /** Bir koseyi piksel hassasiyetinde kaydirir (klavye ince ayari). */
  function nudge(index: number, dx: number, dy: number) {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Ekrandaki piksel adimini normalize koordinata cevir.
    const stepX = dx / rect.width;
    const stepY = dy / rect.height;

    setPlacement((prev) => {
      const corners = [...prev.corners] as Placement['corners'];
      const c = corners[index];
      corners[index] = {
        x: Math.min(1, Math.max(0, c.x + stepX)),
        y: Math.min(1, Math.max(0, c.y + stepY)),
      };
      return { ...prev, corners };
    });
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const qs = `materialId=${encodeURIComponent(materialId)}&filename=${encodeURIComponent(templateFile)}`;
      const res = await fetch(`/api/templates/placement?${qs}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placement }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const polygon = placement.corners.map((c) => `${c.x * 100}% ${c.y * 100}%`).join(', ');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950">
        <header className="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
          <div>
            <h2 className="text-sm font-medium text-neutral-100">Yerleşim — {templateLabel}</h2>
            <p className="text-xs text-neutral-500">
              Ürün yüzeyinin dört köşesini işaretleyin. Tasarım tam bu alana oturur.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
          >
            ✕
          </button>
        </header>

        <div className="grid flex-1 gap-5 overflow-y-auto p-5 lg:grid-cols-2">
          {/* Sol: köşe işaretleme */}
          <div>
            <p className="mb-2 text-xs font-medium text-neutral-400">Köşeleri sürükleyin</p>
            {/*
              Kenarlik disaridaki sarmalayicida durur. Aksi halde surukleme
              olcumu (getBoundingClientRect -> kenarlik dahil kutu) ile
              tutamaklarin yuzde konumu (kenarligin ici) birbirini tutmuyor ve
              kaydedilen koseler gorselde birkac piksel kayiyor.
            */}
            <div className="overflow-hidden rounded-md border border-neutral-800 bg-neutral-900">
              <div
                ref={surfaceRef}
                className="relative select-none"
                style={{ touchAction: 'none' }}
              >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fileUrl(templatePath, templateVersion, 2048)}
                alt={templateLabel}
                className="block w-full"
                draggable={false}
              />

              {/* Seçili alanın dışını karart */}
              <div
                className="pointer-events-none absolute inset-0 bg-black/55"
                style={{
                  clipPath: `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${polygon}, 0% 0%)`,
                }}
              />

              <svg className="pointer-events-none absolute inset-0 h-full w-full">
                <polygon
                  points={placement.corners.map((c) => `${c.x * 100}%,${c.y * 100}%`).join(' ')}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2"
                  strokeDasharray="6 4"
                />
              </svg>

              {placement.corners.map((corner, index) => (
                <CornerHandle
                  key={index}
                  index={index}
                  corner={corner}
                  active={dragIndex === index || focusIndex === index}
                  onGrab={() => setDragIndex(index)}
                  onFocus={() => setFocusIndex(index)}
                  onBlur={() => setFocusIndex((i) => (i === index ? null : i))}
                  onNudge={(dx, dy) => nudge(index, dx, dy)}
                />
              ))}

              {/* Büyüteç: sürüklenen/seçili köşenin altındaki pikselleri gösterir */}
              {loupeIndex !== null && (
                <Loupe
                  src={fileUrl(templatePath, templateVersion, 2048)}
                  point={placement.corners[loupeIndex]}
                  surfaceWidth={surfaceRef.current?.clientWidth ?? 0}
                  label={CORNER_LABELS[loupeIndex]}
                />
              )}
              </div>
            </div>

            <p className="mt-2 text-[11px] leading-relaxed text-neutral-600">
              Sıra: 1 sol üst · 2 sağ üst · 3 sağ alt · 4 sol alt. Bir köşeyi seçtikten sonra{' '}
              <kbd className="rounded bg-neutral-800 px-1">ok tuşlarıyla</kbd> tek piksel,{' '}
              <kbd className="rounded bg-neutral-800 px-1">Shift+ok</kbd> ile on piksel
              kaydırabilirsiniz. Ürün açılı duruyorsa köşeleri gerçek perspektifine göre
              yerleştirin — sistem tasarımı aynı perspektife büker.
            </p>
          </div>

          {/* Sağ: canlı önizleme + ayarlar */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-neutral-400">Önizleme</p>
              {previewing && <span className="text-[10px] text-neutral-600">hesaplanıyor…</span>}
            </div>

            <div className="overflow-hidden rounded-md border border-neutral-800 bg-neutral-900">
              {previewUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={previewUrl} alt="önizleme" className="block w-full" />
              ) : (
                <div className="flex aspect-square items-center justify-center text-xs text-neutral-600">
                  önizleme hazırlanıyor…
                </div>
              )}
            </div>

            <div className="mt-4 space-y-3">
              <Slider
                label="Malzeme dokusu"
                hint="Ahşap damarı / kanvas dokusu / cam yansıması tasarımın altından ne kadar geçsin"
                value={placement.textureStrength}
                onChange={(v) => setPlacement({ ...placement, textureStrength: v })}
              />
              <Slider
                label="Parlaklık (gloss)"
                hint="Şablondaki parlak noktalar tasarımın üstüne eklenir"
                value={placement.glossStrength}
                onChange={(v) => setPlacement({ ...placement, glossStrength: v })}
              />
              <Slider
                label="Opaklık"
                hint="Cam/plexi için 1'in altına indirilebilir"
                value={placement.opacity}
                onChange={(v) => setPlacement({ ...placement, opacity: v })}
              />
              <Slider
                label="Kenar yumuşatma"
                hint="Sert kesim izini gizler"
                value={placement.feather}
                min={0}
                max={8}
                step={0.5}
                format={(v) => `${v.toFixed(1)} px`}
                onChange={(v) => setPlacement({ ...placement, feather: v })}
              />
            </div>
          </div>
        </div>

        <footer className="border-t border-neutral-800 px-5 py-3">
          <ErrorBox>{error}</ErrorBox>
          <div className="mt-2 flex items-center gap-3">
            <Button type="button" onClick={save} disabled={saving || loading}>
              {saving ? 'Kaydediliyor…' : 'Yerleşimi kaydet'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPlacement(DEFAULT_PLACEMENT)}
              disabled={saving}
            >
              Sıfırla
            </Button>
            <span className="ml-auto text-[11px] text-neutral-600">
              Kaydedince bu açı ComfyUI yerine anında kompozisyonla üretilir.
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}

/**
 * Kose tutamagi.
 *
 * Dolu bir daire hizalanacak noktanin tam ustunu kapatiyordu; bunun yerine
 * ici bos bir nisangah + o koseye bakan L seklinde braket kullaniliyor.
 * Merkezdeki 1 piksellik bosluktan altindaki goruntu gorunur, boylece
 * urunun gercek kosesine tam oturtulabilir.
 */
function CornerHandle({
  index,
  corner,
  active,
  onGrab,
  onFocus,
  onBlur,
  onNudge,
}: {
  index: number;
  corner: PlacementPoint;
  active: boolean;
  onGrab: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onNudge: (dx: number, dy: number) => void;
}) {
  // Braket, dortgenin disina bakacak sekilde her kose icin dondurulur.
  const rotation = [0, 90, 180, 270][index];
  const color = active ? '#ffffff' : '#10b981';

  function handleKeyDown(event: React.KeyboardEvent) {
    const step = event.shiftKey ? 10 : 1;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    // Klavyeyle ince ayar yaparken de buyutec gorunsun.
    onFocus();
    onNudge(move[0], move[1]);
  }

  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.focus();
        onGrab();
      }}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={handleKeyDown}
      title={`${CORNER_LABELS[index]} — sürükleyin veya ok tuşlarıyla kaydırın`}
      className="absolute z-10 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center focus:outline-none"
      style={{ left: `${corner.x * 100}%`, top: `${corner.y * 100}%`, cursor: 'grab' }}
    >
      <svg viewBox="0 0 44 44" className="h-full w-full overflow-visible">
        {/* Koyu alt kontur: acik zeminlerde de gorunur kalsin */}
        <g
          transform={`rotate(${rotation} 22 22)`}
          fill="none"
          stroke="rgba(0,0,0,0.65)"
          strokeWidth="5"
          strokeLinecap="round"
        >
          <path d="M22 8 V4 M22 40 V36 M8 22 H4 M40 22 H36" />
          <path d="M6 16 V6 H16" />
        </g>
        <g
          transform={`rotate(${rotation} 22 22)`}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
        >
          {/* Nisangah kollari — merkez bos birakilir */}
          <path d="M22 8 V4 M22 40 V36 M8 22 H4 M40 22 H36" />
          {/* Bu koseye bakan L braketi */}
          <path d="M6 16 V6 H16" />
        </g>
        {/* Tam hedef noktasi */}
        <circle cx="22" cy="22" r="1.5" fill={color} />
        <text
          x="30"
          y="16"
          fontSize="11"
          fontWeight="700"
          fill={color}
          stroke="rgba(0,0,0,0.65)"
          strokeWidth="3"
          paintOrder="stroke"
        >
          {index + 1}
        </text>
      </svg>
    </button>
  );
}

/**
 * Secili kosenin cevresini buyuten mercek.
 *
 * CSS background-position yuzdesi "goruntunun %p noktasini kutunun %p'sine
 * hizala" anlamina geldigi icin, p degerini kose koordinati olarak vermek
 * o noktayi merkeze getirir.
 */
function Loupe({
  src,
  point,
  surfaceWidth,
  label,
}: {
  src: string;
  point: PlacementPoint;
  surfaceWidth: number;
  label: string;
}) {
  const ZOOM = 6;
  // Mercek, kose hangi yaridaysa karsi kosede durur ki eli engellemesin.
  const right = point.x < 0.5;
  const bottom = point.y < 0.5;

  return (
    <div
      className={`pointer-events-none absolute z-20 ${right ? 'right-3' : 'left-3'} ${
        bottom ? 'bottom-3' : 'top-3'
      }`}
    >
      <div
        className="relative h-28 w-28 overflow-hidden rounded-md border-2 border-neutral-700 bg-neutral-900 shadow-lg"
        style={{
          backgroundImage: `url("${src}")`,
          backgroundRepeat: 'no-repeat',
          backgroundSize: `${surfaceWidth * ZOOM}px auto`,
          backgroundPosition: `${point.x * 100}% ${point.y * 100}%`,
          imageRendering: 'pixelated',
        }}
      >
        <svg viewBox="0 0 112 112" className="absolute inset-0 h-full w-full">
          <path
            d="M56 0 V44 M56 68 V112 M0 56 H44 M68 56 H112"
            stroke="#10b981"
            strokeWidth="1"
            opacity="0.9"
          />
          <circle cx="56" cy="56" r="2" fill="#10b981" />
        </svg>
      </div>
      <p className="mt-1 text-center text-[10px] text-neutral-500">{label} · {ZOOM}×</p>
    </div>
  );
}

function Slider({
  label,
  hint,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.05,
  format = (v: number) => `%${Math.round(v * 100)}`,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (value: number) => string;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-xs text-neutral-400">
        {label}
        <span className="text-neutral-600">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-emerald-500"
      />
      {hint && <span className="block text-[10px] leading-tight text-neutral-600">{hint}</span>}
    </label>
  );
}
