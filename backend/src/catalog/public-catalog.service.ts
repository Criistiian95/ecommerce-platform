import { Injectable, NotFoundException } from '@nestjs/common';
import { Category } from '../database/models/category.model';
import { Commerce } from '../database/models/commerce.model';
import { Product } from '../database/models/product.model';

@Injectable()
export class PublicCatalogService {
  async getCatalog(commerceSlug: string) {
    const commerce = await Commerce.findOne({
      where: { slug: commerceSlug, active: true },
      attributes: ['id', 'name', 'slug'],
    });

    if (!commerce) {
      throw new NotFoundException('Comercio no encontrado');
    }

    const products = await Product.findAll({
      where: {
        commerceId: commerce.id,
        active: true,
        published: true,
      },
      attributes: [
        'id',
        'name',
        'description',
        'brand',
        'price',
        'offerPrice',
        'imageUrl',
        'featured',
        'currentStock',
        [Product.sequelize!.literal('(image_data IS NOT NULL)'), 'hasUploadedImage'],
      ],
      include: [{
        model: Category,
        as: 'category',
        required: false,
        attributes: ['id', 'name'],
      }],
      order: [['featured', 'DESC'], ['createdAt', 'DESC']],
    });

    const publicProducts = products.map(product => {
      const plain = product.get({ plain: true }) as any;
      return {
        id: plain.id,
        name: plain.name,
        description: plain.description,
        brand: plain.brand,
        price: plain.price,
        offerPrice: plain.offerPrice,
        imageUrl: plain.imageUrl,
        hasUploadedImage: Boolean(plain.hasUploadedImage),
        featured: Boolean(plain.featured),
        available: Number(plain.currentStock) > 0,
        category: plain.category
          ? { id: plain.category.id, name: plain.category.name }
          : null,
      };
    });

    const categoryMap = new Map<string, { id: string; name: string }>();
    for (const product of publicProducts) {
      if (product.category) {
        categoryMap.set(product.category.id, product.category);
      }
    }

    return {
      commerce: {
        name: commerce.name,
        slug: commerce.slug,
      },
      categories: [...categoryMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
      products: publicProducts,
    };
  }
}
