import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Op } from 'sequelize';
import { Category } from '../database/models/category.model';
import { Product } from '../database/models/product.model';
import { StockMovement } from '../database/models/stock-movement.model';

@Injectable()
export class CatalogService {
  private requireCommerce(commerceId: string | null) {
    if (!commerceId) throw new ForbiddenException('El usuario no pertenece a un comercio');
    return commerceId;
  }

  listCategories(commerceId: string | null) {
    return Category.findAll({
      where: { commerceId: this.requireCommerce(commerceId) },
      order: [['name', 'ASC']],
    });
  }

  async createCategory(commerceId: string | null, input: { name: string; description?: string }) {
    const cid = this.requireCommerce(commerceId);
    const name = input.name?.trim();
    if (!name) throw new BadRequestException('El nombre es obligatorio');

    return Category.create({
      commerceId: cid,
      name,
      description: input.description?.trim() || null,
      active: true,
    });
  }

  listProducts(commerceId: string | null, search?: string) {
    const cid = this.requireCommerce(commerceId);
    const where: any = { commerceId: cid };
    if (search?.trim()) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search.trim()}%` } },
        { sku: { [Op.like]: `%${search.trim()}%` } },
      ];
    }

    return Product.findAll({
      where,
      include: [{ model: Category, as: 'category', required: false }],
      order: [['createdAt', 'DESC']],
    });
  }

  async createProduct(
    commerceId: string | null,
    userId: string,
    input: {
      sku: string;
      name: string;
      description?: string;
      price: number;
      categoryId?: string | null;
      currentStock?: number;
      minimumStock?: number;
      imageUrl?: string;
    },
  ) {
    const cid = this.requireCommerce(commerceId);
    if (!input.sku?.trim() || !input.name?.trim()) {
      throw new BadRequestException('SKU y nombre son obligatorios');
    }
    if (!Number.isFinite(Number(input.price)) || Number(input.price) < 0) {
      throw new BadRequestException('Precio inválido');
    }

    if (input.categoryId) {
      const category = await Category.findOne({ where: { id: input.categoryId, commerceId: cid } });
      if (!category) throw new BadRequestException('Categoría inválida');
    }

    const initialStock = Math.max(0, Number(input.currentStock ?? 0));

    const product = await Product.create({
      commerceId: cid,
      categoryId: input.categoryId || null,
      sku: input.sku.trim(),
      name: input.name.trim(),
      description: input.description?.trim() || null,
      price: Number(input.price),
      currentStock: initialStock,
      minimumStock: Math.max(0, Number(input.minimumStock ?? 0)),
      imageUrl: input.imageUrl?.trim() || null,
      active: true,
    });

    if (initialStock > 0) {
      await StockMovement.create({
        commerceId: cid,
        productId: product.id,
        userId,
        type: 'initial',
        previousStock: 0,
        quantityChange: initialStock,
        newStock: initialStock,
        reason: 'Stock inicial',
      });
    }

    return product;
  }

  async adjustStock(
    commerceId: string | null,
    userId: string,
    productId: string,
    input: { quantityChange: number; reason?: string },
  ) {
    const cid = this.requireCommerce(commerceId);
    const delta = Number(input.quantityChange);
    if (!Number.isInteger(delta) || delta === 0) {
      throw new BadRequestException('El ajuste debe ser un número entero distinto de cero');
    }

    const product = await Product.findOne({ where: { id: productId, commerceId: cid } });
    if (!product) throw new NotFoundException('Producto no encontrado');

    const previousStock = product.currentStock;
    const newStock = previousStock + delta;
    if (newStock < 0) throw new BadRequestException('El stock no puede quedar negativo');

    await product.update({ currentStock: newStock });

    await StockMovement.create({
      commerceId: cid,
      productId: product.id,
      userId,
      type: 'adjustment',
      previousStock,
      quantityChange: delta,
      newStock,
      reason: input.reason?.trim() || null,
    });

    return product;
  }

  stockHistory(commerceId: string | null, productId: string) {
    const cid = this.requireCommerce(commerceId);
    return StockMovement.findAll({
      where: { commerceId: cid, productId },
      order: [['createdAt', 'DESC']],
      limit: 100,
    });
  }
}
