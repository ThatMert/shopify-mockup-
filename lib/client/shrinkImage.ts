/**
 * Tarayici tarafinda buyuk gorselleri yuklemeden once kucultur.
 *
 * Netlify fonksiyonlari istek govdesini en fazla 6 MB kabul ediyor; ikili
 * dosyalar base64'e cevrildigi icin gercek sinir ~4.5 MB. Yerelde sinir yok ama
 * ayni davranis zarar vermez: 3000 px'ten buyuk gorseller zaten sunucuda da
 * bu olcuye indiriliyor.
 *
 * Seffaflik (PNG/WebP) korunur; seffaf olmayan gorseller JPEG'e cevrilir.
 */

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_SIDE = 3000;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Görsel okunamadı'));
    };
    img.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Görsel sıkıştırılamadı'))), type, quality),
  );
}

/** Kanvasta tamamen opak olmayan en az bir piksel var mi? */
function hasTransparency(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < data.length; i += 4 * 7) {
    if (data[i] < 250) return true;
  }
  return false;
}

export async function shrinkImage(file: File): Promise<File> {
  if (file.size <= MAX_BYTES) return file;

  const img = await loadImage(file);
  let scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));

  for (let attempt = 0; attempt < 6; attempt++) {
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Tarayıcı görsel küçültmeyi desteklemiyor');
    ctx.drawImage(img, 0, 0, w, h);

    const transparent = file.type !== 'image/jpeg' && hasTransparency(ctx, w, h);
    const blob = transparent
      ? await toBlob(canvas, 'image/png')
      : await toBlob(canvas, 'image/jpeg', 0.9);

    if (blob.size <= MAX_BYTES) {
      const base = file.name.replace(/\.[^.]+$/, '');
      const ext = transparent ? 'png' : 'jpg';
      return new File([blob], `${base}.${ext}`, { type: blob.type });
    }
    scale *= 0.8;
  }

  throw new Error('Görsel çok büyük; lütfen 4 MB altında bir dosya seçin.');
}
