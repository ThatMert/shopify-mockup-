import Link from 'next/link';
import { prisma } from '@/lib/db';
import { statusBadge, timeAgo } from '@/lib/format';
import { loadMaterials } from '@/lib/registry/materials';
import { fileUrl } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** Ust siradaki sayi kutusu. */
function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-neutral-800/80 bg-neutral-900/40 p-4">
      <p className="text-xs text-neutral-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tracking-tight ${
          accent ? 'text-emerald-400' : 'text-neutral-100'
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-neutral-600">{hint}</p>}
    </div>
  );
}

function Badge({ status }: { status: string }) {
  const { label, className } = statusBadge(status);
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset ${className}`}>
      {label}
    </span>
  );
}

export default async function HomePage() {
  const [drafts, materials, batches, jobCounts, assetCount, productCount] = await Promise.all([
    prisma.draft.findMany({
      where: { batchId: null },
      orderBy: { updatedAt: 'desc' },
      take: 8,
      include: {
        _count: { select: { variants: true, assets: true } },
        assets: {
          where: { kind: 'mockup' },
          orderBy: { position: 'asc' },
          take: 1,
          select: { id: true, path: true },
        },
      },
    }),
    loadMaterials(),
    prisma.batch.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 6,
      include: {
        _count: { select: { pins: true, drafts: true } },
        drafts: {
          select: {
            approved: true,
            jobs: { select: { status: true } },
            assets: {
              where: { kind: 'mockup' },
              orderBy: { position: 'asc' },
              take: 1,
              select: { id: true, path: true },
            },
          },
        },
      },
    }),
    prisma.mockupJob.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.asset.count({ where: { kind: 'mockup' } }),
    prisma.draft.count(),
  ]);

  const readyTemplates = materials.reduce(
    (n, m) => n + m.templates.filter((t) => t.exists).length,
    0,
  );
  const materialsWithSizes = materials.filter((m) => m.sizes.length > 0).length;
  const countOf = (status: string) => jobCounts.find((j) => j.status === status)?._count._all ?? 0;
  const activeJobs = countOf('queued') + countOf('running');

  return (
    <main className="space-y-10">
      {/* --- Giris --- */}
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-center">
        <div>
          <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] text-emerald-300 ring-1 ring-inset ring-emerald-500/20">
            Pinterest → mockup → Shopify
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-50 sm:text-4xl">
            Bir koleksiyondan
            <br />
            <span className="bg-gradient-to-r from-emerald-300 to-teal-400 bg-clip-text text-transparent">
              satışa hazır ürünler
            </span>
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-neutral-400">
            Seçtiğin tasarımlar cam, ahşap, kanvas ve pleksi şablonlarının üzerine perspektifle
            yerleştirilir; başlık, açıklama ve sabit fiyat tablosuyla birlikte Shopify CSV&apos;si
            veya doğrudan ürün olarak çıkar.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/board"
              className="rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-medium text-neutral-950 transition hover:bg-emerald-400"
            >
              Board&apos;dan toplu üret
            </Link>
            <Link
              href="/new"
              className="rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-300 transition hover:bg-neutral-900"
            >
              Tek ürün
            </Link>
            <Link
              href="/templates"
              className="px-1 text-sm text-neutral-500 underline-offset-4 transition hover:text-neutral-300 hover:underline"
            >
              Şablonları yönet →
            </Link>
          </div>
        </div>

        {/* Dort adimlik akis ozeti */}
        <ol className="space-y-1 rounded-xl border border-neutral-800/80 bg-neutral-900/30 p-4">
          {[
            ['Koleksiyon', 'Board linkini ver, tasarımları seç'],
            ['Materyal & açı', 'Cam · ahşap · kanvas · pleksi'],
            ['Üretim', 'Perspektif kompozisyon + isteğe bağlı AI rötuş'],
            ['Çıktı', 'CSV indir veya Shopify’a aktar'],
          ].map(([title, desc], i) => (
            <li key={title} className="flex items-start gap-3 rounded-lg px-2 py-1.5">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-neutral-800 text-[11px] font-medium text-neutral-400">
                {i + 1}
              </span>
              <span>
                <span className="block text-sm text-neutral-200">{title}</span>
                <span className="block text-xs text-neutral-500">{desc}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* --- Sayilar --- */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Ürün taslağı" value={productCount} hint={`${batches.length} toplu üretim`} />
        <Stat
          label="Üretilen mockup"
          value={assetCount}
          hint={`${countOf('done')} tamamlanmış iş`}
        />
        <Stat
          label="Hazır şablon"
          value={readyTemplates}
          hint={`${materials.length} materyal · ${materialsWithSizes} fiyat tablosu`}
        />
        <Stat
          label="Kuyrukta"
          value={activeJobs}
          accent={activeJobs > 0}
          hint={activeJobs > 0 ? 'işleniyor…' : 'boşta'}
        />
      </section>

      {/* --- Toplu uretimler --- */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="text-sm font-medium text-neutral-200">Toplu üretimler</h2>
          <Link href="/board" className="text-xs text-neutral-500 hover:text-emerald-400">
            yeni koleksiyon →
          </Link>
        </div>

        {batches.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-800 px-6 py-12 text-center">
            <p className="text-sm text-neutral-400">Henüz toplu üretim yok</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-neutral-600">
              Bir Pinterest koleksiyonu bağlayıp seçtiğin tasarımlardan tek seferde onlarca ürün
              üretebilirsin.
            </p>
            <Link
              href="/board"
              className="mt-4 inline-block rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 transition hover:bg-emerald-400"
            >
              Başla
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {batches.map((batch) => {
              const jobs = batch.drafts.flatMap((d) => d.jobs);
              const done = jobs.filter((j) => j.status === 'done').length;
              const failed = jobs.filter((j) => j.status === 'failed').length;
              const percent = jobs.length > 0 ? Math.round((done / jobs.length) * 100) : 0;
              const approved = batch.drafts.filter((d) => d.approved).length;
              const covers = batch.drafts.flatMap((d) => d.assets).slice(0, 4);

              return (
                <Link
                  key={batch.id}
                  href={`/board/${batch.id}`}
                  className="group rounded-xl border border-neutral-800/80 bg-neutral-900/40 p-4 transition hover:border-neutral-700 hover:bg-neutral-900/70"
                >
                  <div className="flex items-start gap-3">
                    <h3 className="line-clamp-2 flex-1 text-sm text-neutral-200 transition group-hover:text-emerald-400">
                      {batch.boardName || batch.boardUrl}
                    </h3>
                    <Badge status={batch.status} />
                  </div>

                  <div className="mt-3 flex gap-1.5">
                    {covers.length > 0
                      ? covers.map((asset) => (
                          <div
                            key={asset.id}
                            className="h-12 w-12 overflow-hidden rounded-md bg-neutral-950 ring-1 ring-neutral-800"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={fileUrl(asset.path, undefined, 320)}
                              alt=""
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          </div>
                        ))
                      : Array.from({ length: 4 }).map((_, i) => (
                          <div
                            key={i}
                            className="h-12 w-12 rounded-md border border-dashed border-neutral-800"
                          />
                        ))}
                  </div>

                  <div className="mt-3 h-1 overflow-hidden rounded-full bg-neutral-800">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-[width]"
                      style={{ width: `${percent}%` }}
                    />
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500">
                    <span>{batch._count.drafts} ürün</span>
                    <span>
                      {done}/{jobs.length} mockup
                    </span>
                    {approved > 0 && <span className="text-emerald-500">{approved} onaylı</span>}
                    {failed > 0 && <span className="text-red-400">{failed} hata</span>}
                    <span className="ml-auto">{timeAgo(batch.updatedAt)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* --- Tek urun taslaklari --- */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="text-sm font-medium text-neutral-200">Tek ürün taslakları</h2>
          <Link href="/new" className="text-xs text-neutral-500 hover:text-emerald-400">
            yeni taslak →
          </Link>
        </div>

        {drafts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-800 px-6 py-10 text-center text-sm text-neutral-500">
            Tek ürünlük taslak yok — bir pin veya kendi görselinle{' '}
            <Link href="/new" className="text-neutral-300 underline underline-offset-4">
              başlayabilirsin
            </Link>
            .
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {drafts.map((draft) => (
              <Link
                key={draft.id}
                href={`/draft/${draft.id}`}
                className="group overflow-hidden rounded-xl border border-neutral-800/80 bg-neutral-900/40 transition hover:border-neutral-700"
              >
                <div className="aspect-[4/3] overflow-hidden bg-neutral-950">
                  {draft.assets[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={fileUrl(draft.assets[0].path, undefined, 320)}
                      alt=""
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                      loading="lazy"
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-[11px] text-neutral-700">
                      görsel yok
                    </div>
                  )}
                </div>
                <div className="space-y-1.5 p-3">
                  <p className="truncate text-sm text-neutral-200 transition group-hover:text-emerald-400">
                    {draft.title || 'isimsiz taslak'}
                  </p>
                  <div className="flex items-center gap-2 text-[11px] text-neutral-500">
                    <Badge status={draft.status} />
                    <span className="truncate">
                      {draft._count.variants} ölçü · {draft._count.assets} görsel
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
