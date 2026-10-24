export class ProductImageError extends Error {}

export async function fileToBase64(file: File): Promise<{ data: string; mimeType: string }> {
  if (file.size > 2 * 1024 * 1024) {
    throw new ProductImageError('La imagen supera los 2 MB. Elegí una foto más liviana e intentá nuevamente.');
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new ProductImageError('La imagen debe ser JPG, PNG o WebP.');
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
      resolve({ data: result.slice(comma + 1), mimeType: file.type });
    };
    try {
      reader.readAsDataURL(file);
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
