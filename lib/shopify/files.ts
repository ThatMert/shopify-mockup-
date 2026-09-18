import 'server-only';
import path from 'node:path';
import { prisma } from '@/lib/db';
import { toUploadJpeg } from '@/lib/image/pipeline';
import { shopifyGraphQL, throwUserErrors } from './client';
import { CREATE_FILES, FILE_STATUS, STAGE_UPLOADS } from './queries';

/**
 * Gorselleri Shopify'a yukleme.
 *
 * Iki tuketici var:
 *  - publish.ts: urun olustururken medya olarak baglamak icin `resourceUrl` yeter.
 *  - CSV export: CSV'nin Image Src sutunu herkese acik bir adres istiyor; bunun
 *    icin staged upload'in ustune fileCreate cagrilip cdn.shopify.com adresi alinir.
 */

export interface StagedFile {
  /** productSet/fileCreate'e verilecek gecici kaynak adresi. */
  originalSource: string;
  alt: string;
  filename: string;
}

interface StagedTarget {
  url: string;
  resourceUrl: string;
  parameters: Array<{ name: string; value: string }>;
}

type UserError = { field?: string[] | null; message: string; code?: string };

/**
 * Verilen dosyalari Shopify'in staged upload alanina yukler.
 * (publish.ts icindeki eski uploadImages govdesi buraya tasindi.)
 */
export async function stageAndUpload(
  assets: Array<{ path: string }>,
  altPrefix: string,
): Promise<StagedFile[]> {
  if (assets.length === 0) return [];

  // 1) Her gorsel icin imzali yukleme hedefi iste.
  const buffers = await Promise.all(assets.map((a) => toUploadJpeg(a.path)));
  const filenames = assets.map((a, i) => `${path.basename(a.path, path.extname(a.path))}-${i}.jpg`);

  const staged = await shopifyGraphQL<{
    stagedUploadsCreate: { stagedTargets: StagedTarget[]; userErrors: UserError[] };
  }>(STAGE_UPLOADS, {
    input: buffers.map((buf, i) => ({
      filename: filenames[i],
      mimeType: 'image/jpeg',
      resource: 'IMAGE',
      httpMethod: 'POST',
      fileSize: String(buf.length),
    })),
  });
  throwUserErrors(staged.stagedUploadsCreate.userErrors, 'Görsel yükleme hedefi oluşturulamadı');

  // 2) Dosyalari dogrudan verilen hedefe POST et.
  const targets = staged.stagedUploadsCreate.stagedTargets;
  const results: StagedFile[] = [];

  for (const [i, target] of targets.entries()) {
    const form = new FormData();
    // Imza parametreleri dosyadan ONCE eklenmek zorunda.
    for (const p of target.parameters) form.append(p.name, p.value);
    form.append(
      'file',
      new Blob([new Uint8Array(buffers[i])], { type: 'image/jpeg' }),
      filenames[i],
    );

    const res = await fetch(target.url, { method: 'POST', body: form });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `Görsel yüklenemedi (${filenames[i]}): HTTP ${res.status} ${body.slice(0, 300)}`,
      );
    }
    results.push({
      originalSource: target.resourceUrl,
      alt: `${altPrefix} — ${i + 1}`,
      filename: filenames[i],
    });
  }

  return results;
}

interface FileNode {
  id: string;
  fileStatus?: string;
  image?: { url?: string } | null;
}

/** fileCreate hemen READY donmeyebilir; CDN adresi gelene kadar kisa sure bekler. */
async function waitForUrls(ids: string[], attempts = 10): Promise<Map<string, string>> {
  const urls = new Map<string, string>();

  for (let i = 0; i < attempts && urls.size < ids.length; i++) {
    // Ilk turda beklemeden sor; sonra kademeli olarak bekle.
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, 1000 + i * 500));

    const data = await shopifyGraphQL<{ nodes: Array<FileNode | null> }>(FILE_STATUS, { ids });
    for (const node of data.nodes) {
      if (!node?.id) continue;
      const url = node.image?.url;
      if (url) urls.set(node.id, url);
    }
  }

  return urls;
}

/**
 * Bir taslagin secili mockup'larini Shopify Files'a yukler ve
 * herkese acik CDN adreslerini Asset.publicUrl'e yazar.
 *
 * Zaten publicUrl'i olan gorseller tekrar yuklenmez.
 */
export async function publishAssetUrls(draftId: string): Promise<string[]> {
  const assets = await prisma.asset.findMany({
    where: { draftId, kind: 'mockup', selected: true },
    orderBy: { position: 'asc' },
  });

  const pending = assets.filter((a) => !a.publicUrl);

  if (pending.length > 0) {
    const draft = await prisma.draft.findUnique({ where: { id: draftId } });
    const staged = await stageAndUpload(pending, draft?.title || 'mockup');

    const created = await shopifyGraphQL<{
      fileCreate: { files: FileNode[]; userErrors: UserError[] };
    }>(CREATE_FILES, {
      files: staged.map((f) => ({
        originalSource: f.originalSource,
        alt: f.alt,
        contentType: 'IMAGE',
      })),
    });
    throwUserErrors(created.fileCreate.userErrors, 'Görsel Shopify Files\'a yüklenemedi');

    const files = created.fileCreate.files;
    const missing = files.filter((f) => !f.image?.url).map((f) => f.id);
    const resolved = missing.length > 0 ? await waitForUrls(missing) : new Map<string, string>();

    for (const [i, file] of files.entries()) {
      const url = file.image?.url ?? resolved.get(file.id);
      if (!url || !pending[i]) continue;
      await prisma.asset.update({ where: { id: pending[i].id }, data: { publicUrl: url } });
    }
  }

  const updated = await prisma.asset.findMany({
    where: { draftId, kind: 'mockup', selected: true },
    orderBy: { position: 'asc' },
  });

  const withoutUrl = updated.filter((a) => !a.publicUrl);
  if (withoutUrl.length > 0) {
    throw new Error(
      `${withoutUrl.length} görsel için Shopify CDN adresi alınamadı. ` +
        'Shopify dosyayı hâlâ işliyor olabilir; birkaç saniye sonra tekrar deneyin.',
    );
  }

  return updated.map((a) => a.publicUrl as string);
}
