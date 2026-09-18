/**
 * Bulut (Netlify) icin Prisma semasini uretir ve istenirse Prisma client'i
 * ona gore derler.
 *
 * Tek kaynak prisma/schema.prisma'dir (yerelde SQLite). Buradan turetilen
 * prisma/cloud/schema.prisma yalnizca su noktalarda farklidir:
 *   - provider   : sqlite      -> postgresql   (Netlify Database)
 *   - url        : DATABASE_URL -> NETLIFY_DB_URL
 *   - binaryTargets: Netlify fonksiyonlari AWS Lambda'da (Amazon Linux 2023)
 *     calisiyor; derleme makinesi ise Ubuntu. Ikisinin motoru da pakete girer.
 *
 * Kullanim:
 *   node scripts/prisma-cloud.mjs            -> sadece semayi yaz
 *   node scripts/prisma-cloud.mjs --generate -> semayi yaz + prisma generate
 *   node scripts/prisma-cloud.mjs --migration -> netlify/database/migrations
 *        altina bos veritabanindan bu semaya giden SQL'i yaz (ilk kurulum)
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'prisma', 'schema.prisma');
const outDir = path.join(root, 'prisma', 'cloud');
const out = path.join(outDir, 'schema.prisma');

let schema = fs.readFileSync(src, 'utf8');

const replaceOnce = (from, to, label) => {
  if (!from.test(schema)) throw new Error(`[prisma-cloud] beklenen ifade bulunamadı: ${label}`);
  schema = schema.replace(from, to);
};

replaceOnce(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"', 'provider sqlite');
replaceOnce(/url\s*=\s*env\("DATABASE_URL"\)/, 'url      = env("NETLIFY_DB_URL")', 'url DATABASE_URL');
replaceOnce(
  /generator client \{\s*provider\s*=\s*"prisma-client-js"\s*\}/,
  `generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "rhel-openssl-3.0.x", "debian-openssl-3.0.x"]
}`,
  'generator client',
);

const header =
  '// BU DOSYA OTOMATIK URETILIR — prisma/schema.prisma\'yi duzenleyin.\n' +
  '// Uretici: scripts/prisma-cloud.mjs (Netlify / Postgres icin)\n\n';

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(out, header + schema, 'utf8');
console.log(`[prisma-cloud] ${path.relative(root, out)} yazıldı`);

const args = new Set(process.argv.slice(2));
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' });

if (args.has('--generate')) {
  run(`npx prisma generate --schema "${out}"`);
}

if (args.has('--migration')) {
  const migDir = path.join(root, 'netlify', 'database', 'migrations');
  fs.mkdirSync(migDir, { recursive: true });
  const existing = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql'));
  if (existing.length > 0) {
    console.log(
      `[prisma-cloud] zaten ${existing.length} göç var; ilk kurulum göçü yeniden yazılmadı.\n` +
        '  Şema değişikliği için: npx prisma migrate diff --from-url "$NETLIFY_DB_URL" ' +
        `--to-schema-datamodel ${path.relative(root, out)} --script`,
    );
  } else {
    const sql = execSync(
      `npx prisma migrate diff --from-empty --to-schema-datamodel "${out}" --script`,
      { cwd: root, encoding: 'utf8' },
    );
    const file = path.join(migDir, '0001_init.sql');
    fs.writeFileSync(file, sql, 'utf8');
    console.log(`[prisma-cloud] ${path.relative(root, file)} yazıldı`);
  }
}
