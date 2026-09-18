'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MaterialDTO, MaterialTemplateDTO } from '@/lib/types';
import { fileUrl } from '@/lib/types';
import { shrinkImage } from '@/lib/client/shrinkImage';
import { PlacementEditor } from './PlacementEditor';
import { Button, Card, ErrorBox, Input } from './ui';

/**
 * Mockup sablonlarinin yonetimi: her materyalin acilarina gorsel yukleme,
 * degistirme ve silme. Dosyalar storage/templates/<materyal>/ altina yazilir;
 * JSON'da tanimli olmayan bir ad verilirse yeni bir aci olusur.
 */
export function TemplateManager() {
  const [materials, setMaterials] = useState<MaterialDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    materialId: string;
    file: string;
    path: string;
    mtime: number;
    label: string;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/materials');
      const json = await res.json();
      if (json.error) setError(json.error);
      else {
        setMaterials(json.materials);
        setError('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(materialId: string, filename: string, file: File) {
    const key = `${materialId}/${filename}`;
    setBusyKey(key);
    setError('');
    try {
      const form = new FormData();
      form.append('materialId', materialId);
      form.append('filename', filename);
      // Bulutta istek govdesi ~4.5 MB ile sinirli; buyuk fotograflar once kucultulur.
      form.append('file', await shrinkImage(file));
      const res = await fetch('/api/templates', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKey(null);
    }
  }

  async function remove(materialId: string, filename: string) {
    const key = `${materialId}/${filename}`;
    setBusyKey(key);
    setError('');
    try {
      const res = await fetch(
        `/api/templates?materialId=${encodeURIComponent(materialId)}&filename=${encodeURIComponent(filename)}`,
        { method: 'DELETE' },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) return <p className="text-sm text-neutral-500">Materyaller yükleniyor…</p>;

  const ready = materials.reduce((n, m) => n + m.templates.filter((t) => t.exists).length, 0);

  return (
    <div className="space-y-6">
      <ErrorBox>{error}</ErrorBox>

      <p className="text-sm text-neutral-400">
        {materials.length} materyal · {ready} kullanılabilir şablon. Buraya yüklediğiniz görseller
        &ldquo;boş ürün&rdquo; fotoğraflarıdır; tasarım bunların üzerine giydirilir.
      </p>

      {materials.map((material) => (
        <Card
          key={material.id}
          title={material.label}
          hint={`storage/templates/${material.id}/ · ${material.templates.filter((t) => t.exists).length}/${material.templates.length} açı hazır`}
        >
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {material.templates.map((template) => (
              <TemplateSlot
                key={template.id}
                materialId={material.id}
                template={template}
                busy={busyKey === `${material.id}/${fileNameOf(template)}`}
                onUpload={(file) => upload(material.id, fileNameOf(template), file)}
                onRemove={() => remove(material.id, fileNameOf(template))}
                onEdit={() =>
                  setEditing({
                    materialId: material.id,
                    file: fileNameOf(template),
                    path: template.path,
                    mtime: template.mtime,
                    label: `${material.label} · ${template.label}`,
                  })
                }
              />
            ))}

            <NewAngleSlot
              materialId={material.id}
              existing={material.templates.map((t) => fileNameOf(t))}
              busy={busyKey?.startsWith(`${material.id}/`) ?? false}
              onUpload={(filename, file) => upload(material.id, filename, file)}
            />
          </div>
        </Card>
      ))}

      {editing && (
        <PlacementEditor
          materialId={editing.materialId}
          templateFile={editing.file}
          templatePath={editing.path}
          templateVersion={editing.mtime}
          templateLabel={editing.label}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

/** Sablonun disk uzerindeki dosya adi (path yoksa id'den turetilir). */
function fileNameOf(template: MaterialTemplateDTO): string {
  const fromPath = template.path.split('/').pop();
  return fromPath || `${template.id}.png`;
}

function TemplateSlot({
  materialId,
  template,
  busy,
  onUpload,
  onRemove,
  onEdit,
}: {
  materialId: string;
  template: MaterialTemplateDTO;
  busy: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
  onEdit: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) onUpload(file);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`overflow-hidden rounded-md border transition ${
        dragging
          ? 'border-emerald-500 bg-emerald-950/20'
          : template.exists
            ? 'border-neutral-800'
            : 'border-dashed border-neutral-700'
      }`}
    >
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="block w-full"
        title={template.exists ? 'Değiştirmek için tıklayın' : 'Yüklemek için tıklayın'}
      >
        <div className="flex aspect-square items-center justify-center bg-neutral-950">
          {busy ? (
            <span className="text-xs text-neutral-500">yükleniyor…</span>
          ) : template.exists ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={fileUrl(template.path, template.mtime, 480)}
              alt={template.label}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="px-3 text-center text-xs leading-relaxed text-neutral-600">
              görsel yok
              <br />
              <span className="text-neutral-500 underline">yüklemek için tıklayın</span>
            </span>
          )}
        </div>
      </button>

      <div className="border-t border-neutral-800 px-2 py-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs text-neutral-200">{template.label}</p>
            <p className="truncate text-[10px] text-neutral-600">
              {fileNameOf(template)}
              {template.autoDiscovered && ' · ek açı'}
            </p>
          </div>
          {template.exists && (
            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              className="shrink-0 text-[10px] text-neutral-500 hover:text-red-400 disabled:opacity-40"
            >
              sil
            </button>
          )}
        </div>

        {template.exists && (
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] ${
                template.method === 'composite'
                  ? 'bg-emerald-950 text-emerald-400'
                  : 'bg-neutral-800 text-neutral-400'
              }`}
              title={
                template.method === 'composite'
                  ? 'Yerleşim tanımlı — anında kompozisyonla üretilir'
                  : 'Yerleşim yok — ComfyUI ile üretilir (yavaş)'
              }
            >
              {template.method === 'composite' ? 'kompozisyon' : 'ComfyUI'}
            </span>
            <button
              type="button"
              onClick={onEdit}
              disabled={busy}
              className="text-[10px] text-emerald-500 underline hover:text-emerald-400 disabled:opacity-40"
            >
              {template.hasPlacement ? 'yerleşimi düzenle' : 'yerleşim ayarla'}
            </button>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = '';
        }}
      />
      <span className="hidden">{materialId}</span>
    </div>
  );
}

/** JSON'a dokunmadan yeni bir aci eklemek icin: ad ver + gorsel yukle. */
function NewAngleSlot({
  materialId,
  existing,
  busy,
  onUpload,
}: {
  materialId: string;
  existing: string[];
  busy: boolean;
  onUpload: (filename: string, file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');

  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const filename = slug ? `${slug}.png` : '';
  const duplicate = filename !== '' && existing.includes(filename);

  return (
    <div className="flex flex-col justify-between rounded-md border border-dashed border-neutral-700 p-3">
      <div>
        <p className="mb-2 text-xs font-medium text-neutral-300">Yeni açı ekle</p>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ör. yandan"
          disabled={busy}
          className="text-xs"
        />
        <p className="mt-1 text-[10px] text-neutral-600">
          {duplicate ? (
            <span className="text-amber-500">bu ad zaten var — üzerine yazılır</span>
          ) : filename ? (
            `dosya: ${filename}`
          ) : (
            `storage/templates/${materialId}/`
          )}
        </p>
      </div>

      <Button
        type="button"
        variant="ghost"
        className="mt-3 w-full text-xs"
        disabled={busy || !filename}
        onClick={() => inputRef.current?.click()}
      >
        Görsel seç
      </Button>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && filename) {
            onUpload(filename, file);
            setName('');
          }
          e.target.value = '';
        }}
      />
    </div>
  );
}
