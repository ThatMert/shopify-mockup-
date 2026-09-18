import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { WORKFLOWS_DIR } from '@/lib/paths';
import type { ComfyGraph } from './client';

/** Workflow JSON'larindaki %%PLACEHOLDER%% degerleri icin sozluk. */
export type Placeholders = Record<string, string | number | boolean>;

const cache = new Map<string, unknown>();

/** workflows/ altindaki bir API-format workflow'u okur (dev'de cache'lenmez). */
export async function loadWorkflow(name: string): Promise<ComfyGraph> {
  const file = name.endsWith('.json') ? name : `${name}.json`;
  // Klasor disina cikilmasini engelle.
  const abs = path.join(WORKFLOWS_DIR, path.basename(file));

  let raw = cache.get(abs);
  if (!raw || process.env.NODE_ENV !== 'production') {
    raw = JSON.parse(await fs.readFile(abs, 'utf8'));
    cache.set(abs, raw);
  }

  const { _meta, ...graph } = raw as Record<string, unknown>;
  void _meta;
  return structuredClone(graph) as ComfyGraph;
}

const PLACEHOLDER_RE = /^%%([A-Z0-9_]+)%%$/;

/**
 * Graf icindeki "%%X%%" degerlerini sozlukteki karsiliklariyla degistirir.
 * Deger tam bir placeholder ise tip korunur (sayi sayi kalir); metin icine
 * gomulmusse string interpolasyonu yapilir.
 */
export function applyPlaceholders(graph: ComfyGraph, values: Placeholders): ComfyGraph {
  const resolve = (input: unknown): unknown => {
    if (typeof input === 'string') {
      const exact = input.match(PLACEHOLDER_RE);
      if (exact) {
        const key = `%%${exact[1]}%%`;
        return key in values ? values[key] : input;
      }
      return input.replace(/%%([A-Z0-9_]+)%%/g, (m, k) =>
        `%%${k}%%` in values ? String(values[`%%${k}%%`]) : m,
      );
    }
    if (Array.isArray(input)) return input.map(resolve);
    if (input && typeof input === 'object') {
      return Object.fromEntries(Object.entries(input).map(([k, v]) => [k, resolve(v)]));
    }
    return input;
  };

  return resolve(graph) as ComfyGraph;
}

/**
 * Bir node'u graftan cikarir ve ona baglanan tum input referanslarini siler.
 * Opsiyonel girdiler (orn. ikinci referans gorseli) kullanilmadiginda gerekir.
 */
export function removeNode(graph: ComfyGraph, nodeId: string): ComfyGraph {
  delete graph[nodeId];
  for (const node of Object.values(graph)) {
    for (const [key, value] of Object.entries(node.inputs)) {
      if (Array.isArray(value) && value[0] === nodeId) delete node.inputs[key];
    }
  }
  return graph;
}

/** Grafta cozulmemis placeholder kaldiysa erken ve anlasilir sekilde patlat. */
export function assertNoPlaceholders(graph: ComfyGraph): void {
  const leftovers = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === 'string') {
      for (const m of v.matchAll(/%%[A-Z0-9_]+%%/g)) leftovers.add(m[0]);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(graph);
  if (leftovers.size > 0) {
    throw new Error(`Workflow'da doldurulmamış placeholder var: ${[...leftovers].join(', ')}`);
  }
}
