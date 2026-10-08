import { normalizeCartItems } from './cart-items';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Op } from 'sequelize';
import { Category } from '../database/models/category.model';
import { Commerce } from '../database/models/commerce.model';
import { Product } from '../database/models/product.model';

@Injectable()
export class PublicCartService {
  private async commerceId(slug: string) {
    const commerce = await Commerce.findOne({
      where: { slug, active: true },
      attributes: ['id'],
    });
    if (!commerce) throw new NotFoundException('Comercio no encontrado');
    return commerce.id;
  }

  private publicProduct(product: Product) {
    const plain = product.get({ plain: true }) as any;
    return {
      id: plain.id,
      name: plain.name,
      description: plain.description,
      brand: plain.brand,
      price: plain.price,
      offerPrice: plain.offerPrice,
      imageUrl: plain.imageUrl,
      updatedAt: plain.updatedAt,
      hasUploadedImage: Boolean(plain.hasUploadedImage),
      featured: Boolean(plain.featured),
      available: Number(plain.currentStock) > 0,
      category: plain.category
        ? { id: plain.category.id, name: plain.category.name }
        : null,
    };
  }

  async getProduct(slug: string, productId: string) {
    const commerceId = await this.commerceId(slug);
    const product = await Product.findOne({
      where: {
        id: productId,
        commerceId,
        active: true,
        published: true,
      },
      attributes: [
        'id','name','description','brand','price','offerPrice',
        'imageUrl','updatedAt','featured','currentStock',
        [Product.sequelize!.literal('(image_data IS NOT NULL)'), 'hasUploadedImage'],
      ],
      include: [{
        model: Category,
        as: 'category',
        required: false,
        attributes: ['id','name'],
      }],
    });

    if (!product) throw new NotFoundException('Producto no encontrado');
    return this.publicProduct(product);
  }

  async validateCart(
    slug: string,
    items: Array<{ productId: string; quantity: number }>,
  ) {
    const commerceId = await this.commerceId(slug);
    const cleanItems = normalizeCartItems(items);

    if (!cleanItems.length) return { valid: true, items: [] };

    const products = await Product.findAll({
      where: {
        id: { [Op.in]: cleanItems.map(item => item.productId) },
        commerceId,
        active: true,
        published: true,
      },
      attributes: ['id','currentStock'],
    });

    const stockById = new Map(
      products.map(product => [product.id, Number(product.currentStock)]),
    );

    const result = cleanItems.map(item => ({
      productId: item.productId,
      available:
        stockById.has(item.productId) &&
        (stockById.get(item.productId) ?? 0) >= item.quantity,
    }));

    return {
      valid: result.every(item => item.available),
      items: result,
    };
  }
}
