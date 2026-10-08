import { Injectable, NotFoundException } from '@nestjs/common';
import { Category } from '../database/models/category.model';
import { Commerce } from '../database/models/commerce.model';
import { Product } from '../database/models/product.model';

@Injectable()
export class PublicCatalogService {
  async getCatalog(commerceSlug: string) {
    const commerce = await Commerce.findOne({
      where: { slug: commerceSlug, active: true },
      attributes: [
        'id','name','slug','tagline','primaryColor','secondaryColor',
        'logoUrl','logoMimeType','whatsapp','contactEmail','contactPhone',
        'address','businessHours','pickupEnabled','shippingEnabled',
        [Commerce.sequelize!.literal('(logo_data IS NOT NULL)'), 'hasUploadedLogo'],
      ],
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
        'updatedAt',
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
        updatedAt: plain.updatedAt,
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
        tagline: commerce.tagline,
        primaryColor: commerce.primaryColor,
        secondaryColor: commerce.secondaryColor,
        logoUrl: commerce.logoUrl,
        hasUploadedLogo: Boolean((commerce.get({ plain: true }) as any).hasUploadedLogo),
        whatsapp: commerce.whatsapp,
        contactEmail: commerce.contactEmail,
        contactPhone: commerce.contactPhone,
        address: commerce.address,
        businessHours: commerce.businessHours,
        pickupEnabled: Boolean(commerce.pickupEnabled),
        shippingEnabled: Boolean(commerce.shippingEnabled),
      },
      categories: [...categoryMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
      products: publicProducts,
    };
  }

  async getCommerceLogo(commerceSlug: string) {
    const commerce = await Commerce.findOne({
      where: { slug: commerceSlug, active: true },
      attributes: ['logoData', 'logoMimeType'],
    });

    if (!commerce?.logoData || !commerce.logoMimeType) {
      throw new NotFoundException('Logo no encontrado');
    }

    return {
      data: commerce.logoData,
      mimeType: commerce.logoMimeType,
    };
  }
}
