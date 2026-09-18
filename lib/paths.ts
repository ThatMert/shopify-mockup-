import path from 'node:path';
import fs from 'node:fs/promises';

/** Proje kokunden turetilen tum depolama yollari tek yerde toplanir. */
export const ROOT = process.cwd();

export const STORAGE = path.join(ROOT, 'storage');
export const DIR = {
  templates: path.join(STORAGE, 'templates'),
  sources: path.join(STORAGE, 'sources'),
  processed: path.join(STORAGE, 'processed'),
  mockups: path.join(STORAGE, 'mockups'),
} as const;

export const WORKFLOWS_DIR = path.join(ROOT, 'workflows');
export const MATERIALS_DIR = path.join(ROOT, 'config', 'materials');

/** Klasoru (ve ust klasorlerini) yoksa olusturur. */
export async function ensureDir(dir: string): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/** DB'de sakladigimiz proje-goreli yolu mutlak diske cevirir. */
export function toAbsolute(relPath: string): string {
  return path.isAbsolute(relPath) ? relPath : path.join(ROOT, relPath);
}

/** Mutlak yolu DB'de saklanacak proje-goreli, ileri-slash'li yola cevirir. */
export function toRelative(absPath: string): string {
  return path.relative(ROOT, absPath).split(path.sep).join('/');
}
