/**
 * Dortgen -> dortgen perspektif donusumu (homografi).
 *
 * Tasarim gorselini sablon fotografindaki urun yuzeyinin dort kosesine
 * oturtmak icin kullanilir. Uretken modelden farkli olarak tasarim
 * piksel piksel korunur; hicbir detay yeniden cizilmez.
 */

export interface Point {
  x: number;
  y: number;
}

/** 3x3 homografi matrisi, satir oncelikli. */
export type Matrix3 = [number, number, number, number, number, number, number, number, number];

/**
 * Gauss eliminasyonu ile n x n lineer sistem cozer (kismi pivotlama ile).
 * Cozum yoksa null doner.
 */
function solve(matrix: number[][], rhs: number[]): number[] | null {
  const n = rhs.length;
  // Genisletilmis matris uzerinde calis; girdiler bozulmasin.
  const a = matrix.map((row, i) => [...row, rhs[i]]);

  for (let col = 0; col < n; col++) {
    // Kismi pivotlama: en buyuk mutlak degerli satiri yukari al.
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-12) return null; // tekil matris
    [a[col], a[pivot]] = [a[pivot], a[col]];

    const p = a[col][col];
    for (let j = col; j <= n; j++) a[col][j] /= p;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = a[row][col];
      if (factor === 0) continue;
      for (let j = col; j <= n; j++) a[row][j] -= factor * a[col][j];
    }
  }

  return a.map((row) => row[n]);
}

/**
 * Dort nokta ciftinden homografi hesaplar (DLT).
 * src[i] noktasi dst[i] noktasina gidecek sekilde.
 */
export function homographyFromQuads(src: Point[], dst: Point[]): Matrix3 | null {
  if (src.length !== 4 || dst.length !== 4) return null;

  // Her nokta cifti iki denklem verir; h33 = 1 sabitlenerek 8 bilinmeyen kalir.
  const rows: number[][] = [];
  const rhs: number[] = [];

  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    rhs.push(u);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    rhs.push(v);
  }

  const h = solve(rows, rhs);
  if (!h) return null;
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

/** 3x3 matris tersi; tekil ise null. */
export function invert3(m: Matrix3): Matrix3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;

  return [
    A / det,
    (c * h - b * i) / det,
    (b * f - c * e) / det,
    B / det,
    (a * i - c * g) / det,
    (c * d - a * f) / det,
    C / det,
    (b * g - a * h) / det,
    (a * e - b * d) / det,
  ];
}

/** Noktayi homografi ile donusturur. */
export function applyMatrix(m: Matrix3, p: Point): Point {
  const w = m[6] * p.x + m[7] * p.y + m[8];
  if (Math.abs(w) < 1e-12) return { x: 0, y: 0 };
  return {
    x: (m[0] * p.x + m[1] * p.y + m[2]) / w,
    y: (m[3] * p.x + m[4] * p.y + m[5]) / w,
  };
}

export interface WarpInput {
  /** Kaynak RGBA piksel verisi. */
  data: Buffer | Uint8Array;
  width: number;
  height: number;
}

export interface WarpOutput {
  data: Buffer;
  width: number;
  height: number;
}

/**
 * Kaynak gorseli hedef tuvalde verilen dortgene oturtur.
 *
 * Ters eslestirme (backward mapping) + bilineer ornekleme kullanilir:
 * hedefteki her piksel icin kaynaktaki karsiligi hesaplanir, boylece
 * delik/aliasing olusmaz. Dortgen disinda kalan pikseller seffaf birakilir.
 */
export function warpToQuad(src: WarpInput, quad: Point[], canvas: { width: number; height: number }): WarpOutput | null {
  const corners: Point[] = [
    { x: 0, y: 0 },
    { x: src.width, y: 0 },
    { x: src.width, y: src.height },
    { x: 0, y: src.height },
  ];

  const forward = homographyFromQuads(corners, quad);
  if (!forward) return null;
  const inverse = invert3(forward);
  if (!inverse) return null;

  const out = Buffer.alloc(canvas.width * canvas.height * 4); // seffaf baslar

  // Sadece dortgenin sinirlayici kutusunu tara; tuvalin tamami gereksiz.
  const minX = Math.max(0, Math.floor(Math.min(...quad.map((p) => p.x))));
  const maxX = Math.min(canvas.width - 1, Math.ceil(Math.max(...quad.map((p) => p.x))));
  const minY = Math.max(0, Math.floor(Math.min(...quad.map((p) => p.y))));
  const maxY = Math.min(canvas.height - 1, Math.ceil(Math.max(...quad.map((p) => p.y))));

  const sw = src.width;
  const sh = src.height;
  const sd = src.data;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      // Piksel merkezinden geri esle.
      const w = inverse[6] * (x + 0.5) + inverse[7] * (y + 0.5) + inverse[8];
      if (Math.abs(w) < 1e-12) continue;
      const sx = (inverse[0] * (x + 0.5) + inverse[1] * (y + 0.5) + inverse[2]) / w;
      const sy = (inverse[3] * (x + 0.5) + inverse[4] * (y + 0.5) + inverse[5]) / w;

      if (sx < 0 || sy < 0 || sx >= sw || sy >= sh) continue;

      // Bilineer ornekleme
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(x0 + 1, sw - 1);
      const y1 = Math.min(y0 + 1, sh - 1);
      const fx = sx - x0;
      const fy = sy - y0;

      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;

      const o = (y * canvas.width + x) * 4;
      for (let c = 0; c < 4; c++) {
        const top = sd[i00 + c] * (1 - fx) + sd[i10 + c] * fx;
        const bottom = sd[i01 + c] * (1 - fx) + sd[i11 + c] * fx;
        out[o + c] = Math.round(top * (1 - fy) + bottom * fy);
      }
    }
  }

  return { data: out, width: canvas.width, height: canvas.height };
}
