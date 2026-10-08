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

  private sanitizeProduct(product: Product) {
    const plain = product.get({ plain: true }) as Record<string, unknown>;
    const hasUploadedImage = Boolean(plain.imageData);
    delete plain.imageData;
    return { ...plain, hasUploadedImage };
  }

  private decodeImage(input?: { imageDataBase64?: string | null; imageMimeType?: string | null }) {
    const base64 = input?.imageDataBase64?.trim();
    const mime = input?.imageMimeType?.trim().toLowerCase();

    if (!base64) return null;

    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!mime || !allowed.includes(mime)) {
      throw new BadRequestException('Formato de imagen no permitido');
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(base64, 'base64');
    } catch {
      throw new BadRequestException('Imagen inválida');
    }

    if (!buffer.length) throw new BadRequestException('Imagen inválida');
    if (buffer.length > 2 * 1024 * 1024) {
      throw new BadRequestException('La imagen no puede superar 2 MB');
    }

    return { buffer, mime };
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
      attributes: {
        exclude: ['imageData'],
        include: [[Product.sequelize!.literal('(image_data IS NOT NULL)'), 'hasUploadedImage']],
      },
      include: [{ model: Category, as: 'category', required: false }],
      order: [['active', 'DESC'], ['createdAt', 'DESC']],
    });
  }

  async createProduct(
    commerceId: string | null,
    userId: string,
    input: {
      sku: string;
      name: string;
      description?: string;
      brand?: string;
      price: number;
      cost?: number | null;
      offerPrice?: number | null;
      published?: boolean;
      featured?: boolean;
      categoryId?: string | null;
      currentStock?: number;
      minimumStock?: number;
      imageUrl?: string;
      imageDataBase64?: string | null;
      imageMimeType?: string | null;
    },
  ) {
    const cid = this.requireCommerce(commerceId);
    if (!input.sku?.trim() || !input.name?.trim()) {
      throw new BadRequestException('SKU y nombre son obligatorios');
    }
    if (!Number.isFinite(Number(input.price)) || Number(input.price) < 0) {
      throw new BadRequestException('Precio inválido');
    }
    if (input.cost !== undefined && input.cost !== null && (!Number.isFinite(Number(input.cost)) || Number(input.cost) < 0)) {
      throw new BadRequestException('Costo inválido');
    }
    if (input.offerPrice !== undefined && input.offerPrice !== null && (!Number.isFinite(Number(input.offerPrice)) || Number(input.offerPrice) < 0)) {
      throw new BadRequestException('Precio de oferta inválido');
    }
    if (
      input.offerPrice !== undefined &&
      input.offerPrice !== null &&
      Number(input.offerPrice) >= Number(input.price)
    ) {
      throw new BadRequestException('El precio de oferta debe ser menor al precio normal');
    }

    if (input.categoryId) {
      const category = await Category.findOne({ where: { id: input.categoryId, commerceId: cid } });
      if (!category) throw new BadRequestException('Categoría inválida');
    }

    const initialStock = Math.max(0, Number(input.currentStock ?? 0));
    const uploadedImage = this.decodeImage(input);

    const product = await Product.create({
      commerceId: cid,
      categoryId: input.categoryId || null,
      sku: input.sku.trim(),
      name: input.name.trim(),
      description: input.description?.trim() || null,
      brand: input.brand?.trim() || null,
      price: Number(input.price),
      cost: input.cost === undefined || input.cost === null ? null : Number(input.cost),
      offerPrice:
        input.offerPrice === undefined || input.offerPrice === null
          ? null
          : Number(input.offerPrice),
      currentStock: initialStock,
      minimumStock: Math.max(0, Number(input.minimumStock ?? 0)),
      imageUrl: uploadedImage ? null : (input.imageUrl?.trim() || null),
      imageData: uploadedImage?.buffer ?? null,
      imageMimeType: uploadedImage?.mime ?? null,
      published: input.published ?? true,
      featured: input.featured ?? false,
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

    return this.sanitizeProduct(product);
  }

  async updateProduct(
    commerceId: string | null,
    productId: string,
    input: {
      sku?: string;
      name?: string;
      description?: string | null;
      brand?: string | null;
      price?: number;
      cost?: number | null;
      offerPrice?: number | null;
      published?: boolean;
      featured?: boolean;
      categoryId?: string | null;
      minimumStock?: number;
      imageUrl?: string | null;
      imageDataBase64?: string | null;
      imageMimeType?: string | null;
      clearUploadedImage?: boolean;
    },
  ) {
    const cid = this.requireCommerce(commerceId);
    const product = await Product.findOne({ where: { id: productId, commerceId: cid } });
    if (!product) throw new NotFoundException('Producto no encontrado');

    if (input.categoryId) {
      const category = await Category.findOne({ where: { id: input.categoryId, commerceId: cid } });
      if (!category) throw new BadRequestException('Categoría inválida');
    }

    if (input.price !== undefined && (!Number.isFinite(Number(input.price)) || Number(input.price) < 0)) {
      throw new BadRequestException('Precio inválido');
    }
    if (input.cost !== undefined && input.cost !== null && (!Number.isFinite(Number(input.cost)) || Number(input.cost) < 0)) {
      throw new BadRequestException('Costo inválido');
    }
    if (input.offerPrice !== undefined && input.offerPrice !== null && (!Number.isFinite(Number(input.offerPrice)) || Number(input.offerPrice) < 0)) {
      throw new BadRequestException('Precio de oferta inválido');
    }
    const effectivePrice = input.price !== undefined ? Number(input.price) : Number(product.price);
    if (
      input.offerPrice !== undefined &&
      input.offerPrice !== null &&
      Number(input.offerPrice) >= effectivePrice
    ) {
      throw new BadRequestException('El precio de oferta debe ser menor al precio normal');
    }

    if (
      input.minimumStock !== undefined &&
      (!Number.isInteger(Number(input.minimumStock)) || Number(input.minimumStock) < 0)
    ) {
      throw new BadRequestException('Stock mínimo inválido');
    }

    const uploadedImage = this.decodeImage(input);

    await product.update({
      ...(input.sku !== undefined ? { sku: input.sku.trim() } : {}),
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.brand !== undefined ? { brand: input.brand?.trim() || null } : {}),
      ...(input.price !== undefined ? { price: Number(input.price) } : {}),
      ...(input.cost !== undefined ? { cost: input.cost === null ? null : Number(input.cost) } : {}),
      ...(input.offerPrice !== undefined ? { offerPrice: input.offerPrice === null ? null : Number(input.offerPrice) } : {}),
      ...(input.published !== undefined ? { published: Boolean(input.published) } : {}),
      ...(input.featured !== undefined ? { featured: Boolean(input.featured) } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId || null } : {}),
      ...(input.minimumStock !== undefined ? { minimumStock: Number(input.minimumStock) } : {}),
      ...(uploadedImage
        ? { imageUrl: null, imageData: uploadedImage.buffer, imageMimeType: uploadedImage.mime }
        : {}),
      ...(!uploadedImage && input.imageUrl !== undefined
        ? { imageUrl: input.imageUrl?.trim() || null }
        : {}),
      ...(!uploadedImage && (input.clearUploadedImage || Boolean(input.imageUrl?.trim()))
        ? { imageData: null, imageMimeType: null }
        : {}),
    });

    return this.sanitizeProduct(product);
  }

  async getProductImage(productId: string) {
    const product = await Product.findByPk(productId, {
      attributes: ['id', 'imageData', 'imageMimeType'],
    });
    if (!product?.imageData || !product.imageMimeType) {
      throw new NotFoundException('Imagen no encontrada');
    }
    return {
      data: product.imageData,
      mimeType: product.imageMimeType,
    };
  }

  async setProductActive(commerceId: string | null, productId: string, active: boolean) {
    const cid = this.requireCommerce(commerceId);
    const product = await Product.findOne({ where: { id: productId, commerceId: cid } });
    if (!product) throw new NotFoundException('Producto no encontrado');
    await product.update({ active: Boolean(active) });
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

    return Product.sequelize!.transaction(async transaction => {
      const product = await Product.findOne({
        where: { id: productId, commerceId: cid }, transaction, lock: transaction.LOCK.UPDATE,
      });
      if (!product) throw new NotFoundException('Producto no encontrado');
      const previousStock = product.currentStock;
      const newStock = previousStock + delta;
      if (!Number.isSafeInteger(newStock) || newStock < 0 || newStock > 2147483647) {
        throw new BadRequestException('El stock resultante es inválido');
      }
      await product.update({ currentStock: newStock }, { transaction });
      await StockMovement.create({ commerceId: cid, productId: product.id, userId,
        type: 'adjustment', previousStock, quantityChange: delta, newStock,
        reason: input.reason?.trim() || null }, { transaction });
      return this.sanitizeProduct(product);
    });
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
