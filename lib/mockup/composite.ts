import 'server-only';
import sharp from 'sharp';
import { readRequired } from '@/lib/storage';
import { warpToQuad, type Point } from './homography';
import type { Placement } from './placement';

/**
 * Tasarimi mockup sablonuna kompozisyonla giydirir.
 *
 * Fikir: sablon fotografi "isik ve doku", tasarim ise "albedo" (boya) kabul edilir.
 * Tasarim perspektifle yuzeye oturtulur, sonra sablonun kendi luminansiyla
 * modulate edilir - boylece ahsap damari, kanvas dokusu, cam yansimasi tasarimin
 * altindan gorunur. Tasarimin kendisi hicbir zaman yeniden cizilmez.
 */

export interface CompositeOptions {
  /** Kaliteyi artirmak icin tasarimin hedef alandan kac kat buyuk ornekelenecegi. */
  supersample?: number;
  /**
   * Yuzey yansitici mi (cam, pleksi, metal). false ise yansima (screen) katkisi
   * zorla kapatilir - ahsap ve canvas'ta parlama olmaz.
   */
  reflective?: boolean;
}

export interface CompositeResult {
  buffer: Buffer;
  width: number;
  height: number;
}


/**
 * Tasarimdaki gercek (opak) icerigin sinir kutusunu bulur.
 * Tamamen seffafsa veya kenar boslugu yoksa null doner - o durumda kirpma yapilmaz.
 */
async function opaqueBoundingBox(
  file: Buffer,
): Promise<{ left: number; top: number; width: number; height: number } | null> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < info.height; y++) {
    const row = y * info.width;
    for (let x = 0; x < info.width; x++) {
      // Cok dusuk alfa degerlerini (anti-aliasing artigi) icerik sayma.
      if (data[(row + x) * 4 + 3] <= 8) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) return null; // tamamen seffaf
  if (minX === 0 && minY === 0 && maxX === info.width - 1 && maxY === info.height - 1) {
    return null; // zaten bosluksuz
  }

  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** RGB pikselin algisal parlakligi (0-1). */
function luminance(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export async function compositeMockup(
  templatePath: string,
  designPath: string,
  placement: Placement,
  options: CompositeOptions = {},
): Promise<CompositeResult> {
  const supersample = options.supersample ?? 1.5;

  // --- Sablon: alfa kanali atilir, ham RGB olarak okunur.
  const { data: template, info: templateInfo } = await sharp(
    await readRequired(templatePath),
  )
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const W = templateInfo.width;
  const H = templateInfo.height;
  if (!W || !H) throw new Error(`Şablon görseli okunamadı: ${templatePath}`);

  // --- Yerlesim kosleri normalize -> piksel.
  const quad: Point[] = placement.corners.map((c) => ({ x: c.x * W, y: c.y * H }));

  // Hedef alanin yaklasik boyutu; tasarimi bundan biraz buyuk ornekleyip
  // kucultmek kenarlarda daha temiz sonuc verir.
  const quadW = Math.max(
    Math.hypot(quad[1].x - quad[0].x, quad[1].y - quad[0].y),
    Math.hypot(quad[2].x - quad[3].x, quad[2].y - quad[3].y),
  );
  const quadH = Math.max(
    Math.hypot(quad[3].x - quad[0].x, quad[3].y - quad[0].y),
    Math.hypot(quad[2].x - quad[1].x, quad[2].y - quad[1].y),
  );

  // --- Tasarim: seffaf kenar boslugu kirpilir, sonra hedef alana olceklenir.
  //
  // Kullanici yerlesim editorunde baskinin oturacagi alani isaretliyor; tasarimin
  // cevresinde seffaf bir marj kalirsa gorunen baski o alandan kucuk cikar.
  // Bu yuzden once gercek icerigin sinir kutusu bulunup kirpiliyor.
  const designFile = await readRequired(designPath);
  const box = await opaqueBoundingBox(designFile);

  // NOT: sharp instance'i tek bir cikti cagrisiyla tuketilmeli; ayni instance
  // uzerinde once metadata() sonra raw() cagirmak pipeline'i bozuyor.
  // Gercek boyutlar bu yuzden resolveWithObject ile okunuyor.
  let designPipeline = sharp(designFile).ensureAlpha();
  if (box) designPipeline = designPipeline.extract(box);

  const { data: design, info: designInfo } = await designPipeline
    .resize({
      width: Math.max(16, Math.round(quadW * supersample)),
      height: Math.max(16, Math.round(quadH * supersample)),
      fit: 'fill',
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // --- Tasarimi yuzeyin dortgenine oturt.
  const warped = warpToQuad(
    { data: design, width: designInfo.width, height: designInfo.height },
    quad,
    { width: W, height: H },
  );
  if (!warped) {
    throw new Error('Yerleşim köşeleri geçersiz (dörtgen bozuk veya sıfır alanlı)');
  }

  // --- Kenar yumusatma: alfa kanalini hafifce bulaniklastirarak sert kesim izini gizle.
  if (placement.feather > 0) {
    const alphaOnly = Buffer.allocUnsafe(W * H);
    for (let i = 0, a = 0; i < warped.data.length; i += 4, a++) {
      alphaOnly[a] = warped.data[i + 3];
    }
    // NOT: sharp tek kanalli raw girdiyi blur ederken sRGB'ye yukseltip 3 kanal
    // dondurebiliyor. Renk uzayi acikca zorlanir, yine de gelen kanal sayisina
    // gore adimlanir - aksi halde alfa yanlis piksellerden okunur.
    const { data: blurred, info } = await sharp(alphaOnly, {
      raw: { width: W, height: H, channels: 1 },
    })
      .blur(placement.feather)
      .toColourspace('b-w')
      .raw()
      .toBuffer({ resolveWithObject: true });

    const stride = info.channels;
    for (let i = 0, a = 0; i < warped.data.length; i += 4, a++) {
      warped.data[i + 3] = blurred[a * stride];
    }
  }

  // --- Yuzey bolgesinin ortalama parlakligi: modulasyon bunun etrafinda yapilir,
  // boylece koyu ahsapta tasarim kararmaz, sadece dokusu gelir.
  let sum = 0;
  let count = 0;
  for (let i = 0, p = 0; i < warped.data.length; i += 4, p += 3) {
    if (warped.data[i + 3] === 0) continue;
    sum += luminance(template[p], template[p + 1], template[p + 2]);
    count++;
  }
  if (count === 0) {
    throw new Error('Yerleşim şablonun dışında kalıyor');
  }
  const meanLum = Math.max(0.02, sum / count);

  // --- Piksel piksel harmanlama.
  //
  // t     = sablonun isik/golge deseninin gucu (ComfyUI karsiligi: multiply blend opakligi)
  // gloss = yansima/parlama gucu             (ComfyUI karsiligi: screen blend opakligi)
  const out = Buffer.allocUnsafe(W * H * 3);
  const t = placement.multiplyOpacity ?? placement.textureStrength;
  const gloss =
    options.reflective === false ? 0 : (placement.screenOpacity ?? placement.glossStrength);
  const glossThreshold = placement.glossThreshold;
  const opacity = placement.opacity;

  for (let i = 0, p = 0; i < warped.data.length; i += 4, p += 3) {
    const tr = template[p];
    const tg = template[p + 1];
    const tb = template[p + 2];

    const alpha = warped.data[i + 3] / 255;
    if (alpha === 0) {
      out[p] = tr;
      out[p + 1] = tg;
      out[p + 2] = tb;
      continue;
    }

    const lum = luminance(tr, tg, tb);

    // Malzemenin isigi/dokusu: bolgenin ortalamasina gore goreli parlaklik.
    // t=0 iken carpan 1 (duz yapistirma), t=1 iken tamamen sablonun isigi.
    const shade = 1 - t + t * (lum / meanLum);

    // Yansima: esigin ustundeki parlaklik tasarimin ustune eklenir.
    const spec =
      gloss > 0 && lum > glossThreshold
        ? ((lum - glossThreshold) / (1 - glossThreshold)) * gloss * 255
        : 0;

    const a = alpha * opacity;
    for (let c = 0; c < 3; c++) {
      const painted = warped.data[i + c] * shade + spec;
      const base = template[p + c];
      out[p + c] = Math.max(0, Math.min(255, Math.round(painted * a + base * (1 - a))));
    }
  }

  const buffer = await sharp(out, { raw: { width: W, height: H, channels: 3 } })
    .png({ compressionLevel: 6 })
    .toBuffer();

  return { buffer, width: W, height: H };
}
