import { BadRequestException } from '@nestjs/common';

export function normalizeCartItems(input: unknown) {
  if (!Array.isArray(input) || input.length > 200) {
    throw new BadRequestException('Carrito inválido');
  }
  const quantities = new Map<string, number>();
  for (const item of input) {
    if (!item || typeof item.productId !== 'string' || !item.productId.trim() ||
        !Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
      throw new BadRequestException('Producto o cantidad inválidos');
    }
    const id = item.productId.trim();
    const total = (quantities.get(id) ?? 0) + item.quantity;
    if (!Number.isSafeInteger(total) || total > 2147483647) {
      throw new BadRequestException('Cantidad inválida');
    }
    quantities.set(id, total);
  }
  // Every stock operation locks products in the same order.
  return [...quantities].sort(([a], [b]) => a.localeCompare(b))
    .map(([productId, quantity]) => ({ productId, quantity }));
}
