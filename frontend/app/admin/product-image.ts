export class ProductImageError extends Error {}

const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_STORED_BYTES = 2 * 1024 * 1024;
const MAX_SIDE = 1920;

async function optimizeImage(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  const image = new Image();
  let canvas: HTMLCanvasElement | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        image.onload = null;
        image.onerror = null;
        reject(new ProductImageError('La foto tardó demasiado en abrirse. Elegí otra imagen e intentá nuevamente.'));
      }, 30000);
      image.onload = () => { window.clearTimeout(timer); resolve(); };
      image.onerror = () => {
        window.clearTimeout(timer);
        reject(new ProductImageError('No se pudo abrir la imagen. Verificá que sea una foto JPG, PNG o WebP válida.'));
      };
      image.src = url;
    });
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height) throw new ProductImageError('La imagen no tiene dimensiones válidas.');
    if (file.size <= MAX_STORED_BYTES && Math.max(width, height) <= MAX_SIDE) return file;

    canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new ProductImageError('Este navegador no pudo preparar la foto. Probá con otra imagen.');
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    // JPEG for opaque photos; WebP (or the browser's PNG fallback) preserves transparency.
    const mimeType = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
    for (let attempt = 0; attempt < 5; attempt++) {
      canvas.width = Math.max(1, Math.round(width * scale * 0.8 ** attempt));
      canvas.height = Math.max(1, Math.round(height * scale * 0.8 ** attempt));
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.86, 0.72, 0.55]) {
        const blob = await new Promise<Blob>((resolve, reject) => {
          const timer = window.setTimeout(() => reject(new ProductImageError('No se pudo terminar de optimizar la foto. Intentá con otra imagen.')), 15000);
          try {
            canvas!.toBlob(result => {
              window.clearTimeout(timer);
              if (result?.size) resolve(result);
              else reject(new ProductImageError('No se pudo optimizar la imagen. Elegí otra foto.'));
            }, mimeType, quality);
          } catch {
            window.clearTimeout(timer);
            reject(new ProductImageError('No se pudo optimizar la imagen. Elegí otra foto.'));
          }
        });
        if (blob.size <= MAX_STORED_BYTES) return blob;
        // PNG ignores quality; reduce dimensions instead of encoding it repeatedly.
        if (blob.type === 'image/png') break;
      }
    }
    throw new ProductImageError('No se pudo reducir esta imagen lo suficiente. Probá con otra foto.');
  } finally {
    image.onload = null;
    image.onerror = null;
    image.src = '';
    URL.revokeObjectURL(url);
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}

export async function fileToBase64(file: File): Promise<{ data: string; mimeType: string }> {
  if (file.size > MAX_SOURCE_BYTES) {
    throw new ProductImageError('La imagen supera los 25 MB. Elegí una foto más liviana e intentá nuevamente.');
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new ProductImageError('La imagen debe ser JPG, PNG o WebP.');
  }
  let optimized: Blob;
  try {
    optimized = await optimizeImage(file);
  } catch (error) {
    if (error instanceof ProductImageError) throw error;
    throw new ProductImageError('No se pudo preparar la imagen. Volvé a seleccionarla o elegí otra foto.');
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new ProductImageError('No se pudo leer la imagen. Volvé a seleccionarla.'));
    reader.onabort = () => reject(new ProductImageError('La lectura de la imagen se interrumpió. Volvé a seleccionarla.'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      if (comma === -1 || !result.slice(comma + 1)) {
        reject(new ProductImageError('No se pudo procesar la imagen. Elegí otro archivo.'));
        return;
      }
      resolve({ data: result.slice(comma + 1), mimeType: optimized.type });
    };
    try {
      reader.readAsDataURL(optimized);
    } catch {
      reject(new ProductImageError('No se pudo leer la imagen. Volvé a seleccionarla.'));
    }
  });
}

export function productSaveError(error: unknown): string {
  return error instanceof ProductImageError
    ? error.message
    : 'No pudimos confirmar el guardado. Revisá tu conexión y actualizá la lista antes de volver a intentarlo.';
}
