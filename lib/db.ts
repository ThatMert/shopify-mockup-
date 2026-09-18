import { PrismaClient } from '@prisma/client';
import { IS_CLOUD } from '@/lib/runtime';

/**
 * Bulutta (Netlify) her fonksiyon ornegi kendi baglanti havuzunu acar; ayni anda
 * onlarca ornek calisabildigi icin havuz kucuk tutulmazsa Postgres'in baglanti
 * siniri hizla dolar. Yerelde SQLite icin ek ayar gerekmez.
 */
function cloudDatasourceUrl(): string | undefined {
  const raw = process.env.NETLIFY_DB_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '3');
    if (!url.searchParams.has('pool_timeout')) url.searchParams.set('pool_timeout', '20');
    return url.toString();
  } catch {
    return raw;
  }
}

function createClient(): PrismaClient {
  const datasourceUrl = IS_CLOUD ? cloudDatasourceUrl() : undefined;
  return datasourceUrl ? new PrismaClient({ datasourceUrl }) : new PrismaClient();
}

// Next.js dev modunda hot-reload her seferinde yeni client acmasin diye global'de tutulur.
// Bulutta da ayni fonksiyon ornegindeki istekler arasinda paylasilir.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

globalForPrisma.prisma = prisma;
