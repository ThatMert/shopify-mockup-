/**
 * Tasinabilir paket olusturur: cift tiklayip calistirilabilen, Node kurulumu
 * gerektirmeyen tek klasor.
 *
 * Icerik:
 *   Baslat.cmd / Baslat.vbs   -> sunucuyu baslatip tarayiciyi acar
 *   node.exe                  -> gomulu Node calisma zamani
 *   app/                      -> next build --output standalone ciktisi
 *   app/config, app/workflows -> materyal/fiyat tablolari ve ComfyUI graf'lari
 *   app/storage/templates     -> mockup sablon gorselleri + .placement.json
 *   app/prisma/dev.db         -> veritabani (mevcut taslaklar dahil)
 *   .env                      -> ayarlar (kullanici duzenleyebilsin diye kok dizinde)
 *
 * Kullanim: npm run package
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/**
 * --with-media : daha once uretilmis gorselleri (storage/mockups, sources,
 * processed) de pakete kopyalar. Varsayilan olarak kopyalanmaz; veritabani
 * geliyor ama eski onizlemeler paketin icinde bulunmaz.
 */
const WITH_MEDIA = process.argv.includes('--with-media');

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'dist', 'MockupShopify');
const APP = path.join(OUT, 'app');

const log = (msg) => console.log(`  ${msg}`);

function run(command, args, { optional = false } = {}) {
  const res = spawnSync(command, args, { stdio: 'inherit', shell: true, cwd: ROOT });
  if (res.status !== 0) {
    if (optional) {
      log(`uyarı: "${command} ${args.join(' ')}" başarısız, mevcut çıktıyla devam ediliyor`);
      return false;
    }
    throw new Error(
      `Komut başarısız: ${command} ${args.join(' ')}
` +
        'Çalışan bir "npm run dev" varsa kapatıp tekrar deneyin (dosyaları kilitliyor).',
    );
  }
  return true;
}

function copyDir(from, to, { optional = false } = {}) {
  if (!fs.existsSync(from)) {
    if (optional) return false;
    throw new Error(`Kopyalanacak klasör yok: ${from}`);
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
  return true;
}

function copyFile(from, to, { optional = false } = {}) {
  if (!fs.existsSync(from)) {
    if (optional) return false;
    throw new Error(`Kopyalanacak dosya yok: ${from}`);
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  return true;
}

/** Klasorun toplam boyutu (MB). */
function sizeMb(dir) {
  let total = 0;
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else total += fs.statSync(full).size;
    }
  };
  walk(dir);
  return (total / 1024 / 1024).toFixed(0);
}

// --- 1) Uretim derlemesi -----------------------------------------------------
console.log('\n[1/6] Üretim derlemesi (next build)…');
// Windows'ta .next/trace bazen kilitli kaliyor; silinemezse derleme yine de
// kendi ciktisini tazeledigi icin devam edilir.
try {
  fs.rmSync(path.join(ROOT, '.next'), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
} catch {
  log('.next tamamen silinemedi, derlemeye devam ediliyor');
}
// Istemci zaten uretilmisse bu adim atlanabilir; dev sunucusu acikken
// motor dosyasi kilitli oldugu icin basarisiz olabiliyor.
run('npx', ['prisma', 'generate'], { optional: true });
run('npx', ['next', 'build']);

const standalone = path.join(ROOT, '.next', 'standalone');
if (!fs.existsSync(standalone)) {
  throw new Error(
    ".next/standalone yok. next.config.mjs içinde output: 'standalone' tanımlı olmalı.",
  );
}

// --- 2) Cikti klasoru --------------------------------------------------------
console.log('[2/6] Paket klasörü hazırlanıyor…');
fs.rmSync(OUT, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
fs.mkdirSync(APP, { recursive: true });

copyDir(standalone, APP);

// Next'in dosya izleyicisi storage/ altini da standalone ciktisina kopyaliyor
// (uretilmis mockup'lar dahil, yuzlerce MB). Pakete yalnizca sablonlar girmeli;
// bu yuzden kopyalanan storage atilip asagida yeniden kurulur.
fs.rmSync(path.join(APP, 'storage'), { recursive: true, force: true, maxRetries: 5 });

copyDir(path.join(ROOT, '.next', 'static'), path.join(APP, '.next', 'static'));
copyDir(path.join(ROOT, 'public'), path.join(APP, 'public'), { optional: true });
log('sunucu + statik dosyalar kopyalandı');

// Next'in dosya izleyicisi calisma zamani bagimliliklarinin bir kismini
// atliyor (orn. next/dist/server/lib/cpu-profile.js, @swc/helpers). Proje
// icinde test edilirken bu fark edilmiyor cunku Node bir ust klasordeki
// node_modules'a dusuyor; baska bir bilgisayarda sunucu hic acilmiyor.
// Bu yuzden bagimlilik agaci pakette npm ile bastan kuruluyor: eksiksiz olur.
fs.rmSync(path.join(APP, 'node_modules'), { recursive: true, force: true, maxRetries: 5 });

// --- 3) Calisma zamani verileri ---------------------------------------------
console.log('[3/6] Yapılandırma, şablonlar ve veritabanı…');
copyDir(path.join(ROOT, 'config'), path.join(APP, 'config'));
copyDir(path.join(ROOT, 'workflows'), path.join(APP, 'workflows'));

// Sablon gorselleri ve yerlesim dosyalari (.placement.json) birlikte tasinir.
copyDir(path.join(ROOT, 'storage', 'templates'), path.join(APP, 'storage', 'templates'), {
  optional: true,
});
for (const dir of ['sources', 'processed', 'mockups']) {
  fs.mkdirSync(path.join(APP, 'storage', dir), { recursive: true });
  if (WITH_MEDIA) {
    copyDir(path.join(ROOT, 'storage', dir), path.join(APP, 'storage', dir), { optional: true });
  }
}
if (WITH_MEDIA) log('üretilmiş görseller de kopyalandı (--with-media)');

const templateCount = fs.existsSync(path.join(APP, 'storage', 'templates'))
  ? fs
      .readdirSync(path.join(APP, 'storage', 'templates'), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .flatMap((e) =>
        fs.readdirSync(path.join(APP, 'storage', 'templates', e.name)).filter((f) =>
          /\.(png|jpe?g|webp)$/i.test(f),
        ),
      ).length
  : 0;
const placementCount = fs.existsSync(path.join(APP, 'storage', 'templates'))
  ? fs
      .readdirSync(path.join(APP, 'storage', 'templates'), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .flatMap((e) =>
        fs
          .readdirSync(path.join(APP, 'storage', 'templates', e.name))
          .filter((f) => f.endsWith('.placement.json')),
      ).length
  : 0;
log(`${templateCount} şablon görseli, ${placementCount} yerleşim dosyası`);

// Prisma: sema + veritabani + sorgu motoru.
copyFile(path.join(ROOT, 'prisma', 'schema.prisma'), path.join(APP, 'prisma', 'schema.prisma'));
copyFile(path.join(ROOT, 'prisma', 'dev.db'), path.join(APP, 'prisma', 'dev.db'), {
  optional: true,
});
if (!WITH_MEDIA) {
  log('not: veritabanı taşındı, eski önizleme görselleri pakete alınmadı (--with-media ile alınır)');
}

// Uretim bagimliliklari paketin icine kurulur. package.json + lock dosyasi
// kopyalanip "npm ci --omit=dev" calistirilir; prisma'nin postinstall adimi
// da burada calisip sorgu motorunu paketin icinde uretir.
copyFile(path.join(ROOT, 'package.json'), path.join(APP, 'package.json'));
copyFile(path.join(ROOT, 'package-lock.json'), path.join(APP, 'package-lock.json'), {
  optional: true,
});

console.log('      üretim bağımlılıkları kuruluyor (npm ci --omit=dev)…');
const installed = spawnSync(
  'npm',
  ['ci', '--omit=dev', '--no-audit', '--no-fund', '--ignore-scripts=false'],
  { stdio: 'inherit', shell: true, cwd: APP },
);
if (installed.status !== 0) {
  throw new Error('Bağımlılık kurulumu başarısız (npm ci --omit=dev)');
}

// @next/swc yalnizca derleme zamani gerekli (~140 MB); calisan sunucu kullanmaz.
fs.rmSync(path.join(APP, 'node_modules', '@next', 'swc-win32-x64-msvc'), {
  recursive: true,
  force: true,
  maxRetries: 5,
});

// standalone server.js "next" paketini bekliyor; package.json'daki script'ler
// pakette anlamsiz oldugu icin sadelestirilir.
const appPkg = JSON.parse(fs.readFileSync(path.join(APP, 'package.json'), 'utf8'));
appPkg.scripts = { start: 'node server.js' };
appPkg.devDependencies = undefined;
fs.writeFileSync(path.join(APP, 'package.json'), `${JSON.stringify(appPkg, null, 2)}\n`, 'utf8');
log('bağımlılıklar kuruldu, prisma istemcisi paketin içinde üretildi');

// --- 4) Ayarlar --------------------------------------------------------------
console.log('[4/6] .env aktarılıyor…');
const envSource = fs.existsSync(path.join(ROOT, '.env'))
  ? path.join(ROOT, '.env')
  : path.join(ROOT, '.env.example');
// Prisma, "file:" yollarini SEMA dosyasinin bulundugu klasore gore cozer
// (burada app/prisma/). Dolayisiyla dogru deger "./dev.db"; calisma dizinine
// gore yazilirsa veritabani bulunamaz ("Unable to open the database file").
const envText = fs
  .readFileSync(envSource, 'utf8')
  .replace(/^DATABASE_URL=.*$/m, 'DATABASE_URL="file:./dev.db"');
fs.writeFileSync(path.join(OUT, '.env'), envText, 'utf8');
log(`${path.basename(envSource)} → dist/MockupShopify/.env`);

// --- 5) Node calisma zamani --------------------------------------------------
console.log('[5/6] Node çalışma zamanı gömülüyor…');
copyFile(process.execPath, path.join(OUT, 'node.exe'));
log(`node ${process.version} (${(fs.statSync(process.execPath).size / 1024 / 1024).toFixed(0)} MB)`);

// --- 6) Baslaticilar ---------------------------------------------------------
console.log('[6/6] Başlatıcılar yazılıyor…');

// Konsol penceresi acan surum: hata ayiklamak icin ciktiyi gosterir.
fs.writeFileSync(
  path.join(OUT, 'Baslat (konsollu).cmd'),
  `@echo off
title Mockup -^> Shopify
cd /d "%~dp0"
set "PORT=%1"
if "%PORT%"=="" set "PORT=3210"
set "HOSTNAME=127.0.0.1"
set "NODE_ENV=production"
echo Sunucu baslatiliyor... http://localhost:%PORT%
start "" http://localhost:%PORT%
"%~dp0node.exe" --env-file="%~dp0.env" "%~dp0app\\server.js"
echo.
echo Sunucu durdu. Kapatmak icin bir tusa basin.
pause >nul
`,
  'utf8',
);

// Cift tiklanan asil surum: pencere acmadan calistirir, tarayiciyi acar.
fs.writeFileSync(
  path.join(OUT, 'Baslat.vbs'),
  `' Mockup -> Shopify : sunucuyu gizli baslatir ve tarayiciyi acar.
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(WScript.ScriptFullName)
port = "3210"

shell.CurrentDirectory = base
shell.Environment("PROCESS")("PORT") = port
shell.Environment("PROCESS")("HOSTNAME") = "127.0.0.1"
shell.Environment("PROCESS")("NODE_ENV") = "production"

' 0 = gizli pencere, False = bitmesini bekleme
shell.Run """" & base & "\\node.exe"" --env-file=""" & base & "\\.env"" """ & base & "\\app\\server.js""", 0, False

' Sunucu ayaga kalkana kadar kisa bir bekleme, sonra tarayici.
WScript.Sleep 2500
shell.Run "http://localhost:" & port & "/", 1, False
`,
  'utf8',
);

// Sunucuyu durdurmak icin.
fs.writeFileSync(
  path.join(OUT, 'Durdur.cmd'),
  `@echo off
title Mockup -^> Shopify : durdur
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3210" ^| findstr "LISTENING"') do (
  echo Sunucu kapatiliyor (PID %%p)...
  taskkill /PID %%p /F >nul 2>&1
)
echo Kapatildi.
timeout /t 2 >nul
`,
  'utf8',
);

fs.writeFileSync(
  path.join(OUT, 'BENİOKU.txt'),
  `Mockup -> Shopify (taşınabilir sürüm)
=====================================

ÇALIŞTIRMA
  Baslat.vbs dosyasına çift tıklayın. Sunucu arka planda başlar ve
  tarayıcıda http://localhost:3210 açılır.

  Sorun olursa "Baslat (konsollu).cmd" ile açın; hata mesajları görünür.
  Kapatmak için Durdur.cmd (veya konsollu sürümde Ctrl+C).

AYARLAR
  .env dosyası bu klasördedir. Shopify ve Pinterest bilgilerini oradan
  düzenleyip uygulamayı yeniden başlatın.

İÇERİK
  app/config/materials/*.json   ölçü ve fiyat tabloları
  app/storage/templates/        mockup şablonları + .placement.json yerleşimleri
  app/storage/mockups/          üretilen görseller buraya yazılır
  app/prisma/dev.db             veritabanı (taslaklar, toplu üretimler)
  app/workflows/                ComfyUI graf dosyaları

NOTLAR
  - Node kurulumu gerekmez; node.exe klasörün içindedir.
  - Klasörü olduğu gibi başka bir bilgisayara kopyalayabilirsiniz.
  - ComfyUI yalnızca "comfy" veya "composite+harmonize" yöntemli açılar için
    gerekir; yerleşimi tanımlı açılar ComfyUI olmadan üretilir.
  - Yedek almak için app/storage/ ve app/prisma/dev.db yeterlidir.
  - Veritabanı taşındığı için eski toplu üretimler listede görünür; ancak o
    üretimlerin görselleri pakete alınmadıysa önizlemeler boş çıkar. Görselleri
    de istiyorsanız paketi "npm run package -- --with-media" ile üretin.
`,
  'utf8',
);

console.log(`\n✓ Paket hazır: ${OUT}`);
console.log(`  Boyut: ~${sizeMb(OUT)} MB`);
console.log('  Çalıştırmak için: Baslat.vbs\n');
