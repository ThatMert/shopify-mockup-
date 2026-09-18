import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** Netlify derlemesinde NETLIFY=true tanimli gelir. */
const isNetlify = process.env.NETLIFY === 'true';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Tasinabilir paket icin: sunucu ve bagimliliklari .next/standalone altina
  // toplanir, boylece node_modules olmadan calisir (scripts/package-portable.mjs).
  // Netlify'in Next.js adaptoru ciktiyi kendisi yonettigi icin orada verilmez.
  ...(isNetlify ? {} : { output: 'standalone' }),

  // Calisma modu derleme aninda koda gomulur: fonksiyonlarin calisma aninda
  // NETLIFY degiskeni her zaman bulunmuyor. Sirlar (APP_PASSWORD vb.) BURAYA
  // YAZILMAZ; onlar calisma aninda ortamdan okunur.
  env: {
    DEPLOY_TARGET: isNetlify ? 'cloud' : (process.env.DEPLOY_TARGET ?? ''),
  },

  // D:\ altinda baska bir package-lock.json oldugu icin Next calisma alani
  // kokunu yanlis tahmin ediyor ve cikti "standalone/shopify-ai-image/..."
  // seklinde ic ice giriyor. Kok acikca sabitlenir.
  outputFileTracingRoot: projectRoot,

  // Uretilen gorseller ve paket ciktisi izlemeye girmemeli; aksi halde
  // storage/ altindaki yuzlerce MB standalone ciktisina kopyalaniyor.
  // Calisma zamaninda gereken sablonlari paketleme betigi kendisi kopyalar.
  outputFileTracingExcludes: {
    '*': ['storage/**', 'dist/**', '.next/cache/**', 'prisma/dev.db'],
  },

  // Prisma'nin sorgu motoru dinamik yuklendigi icin izleyici bazen atliyor;
  // bulutta Lambda (rhel) motoru ve sema acikca pakete eklenir.
  ...(isNetlify
    ? {
        outputFileTracingIncludes: {
          '*': [
            './node_modules/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node',
            './node_modules/.prisma/client/schema.prisma',
          ],
          '/**/*': [
            './node_modules/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node',
            './node_modules/.prisma/client/schema.prisma',
          ],
        },
      }
    : {}),

  serverExternalPackages: ['sharp', 'ws', '@prisma/client'],
  experimental: {
    // Mockup üretimi uzun sürebiliyor; server action gövde limiti yüksek tutuluyor.
    serverActions: { bodySizeLimit: '25mb' },
  },
};
export default nextConfig;
