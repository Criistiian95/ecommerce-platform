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
        'accountDisplay','instagramUrl','facebookUrl','tiktokUrl','youtubeUrl','heroTitle','heroButtonText','announcementText','heroLayout','backgroundColor','coverPreset','id','fontFamily','updatedAt','name','slug','tagline','headerTagline','headerDisplay','primaryColor','secondaryColor',
        'logoUrl','logoMimeType','whatsapp','contactEmail','contactPhone',
        'address','businessHours','pickupEnabled','shippingEnabled',
        [Commerce.sequelize!.literal('(cover_data IS NOT NULL)'), 'hasUploadedCover'],
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
        updatedAt: commerce.get('updatedAt'),
        name: commerce.name,
        slug: commerce.slug,
        tagline: commerce.tagline,
        headerTagline: commerce.headerTagline,
        headerDisplay: commerce.headerDisplay,
        accountDisplay: commerce.accountDisplay,
        instagramUrl: commerce.instagramUrl,
        facebookUrl: commerce.facebookUrl,
        tiktokUrl: commerce.tiktokUrl,
        youtubeUrl: commerce.youtubeUrl,
        heroTitle: commerce.heroTitle,
        heroButtonText: commerce.heroButtonText,
        announcementText: commerce.announcementText,
        heroLayout: commerce.heroLayout,
        fontFamily: commerce.fontFamily,
        backgroundColor: commerce.backgroundColor,
        coverPreset: commerce.coverPreset,
        hasUploadedCover: Boolean(commerce.get('hasUploadedCover')),
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

  async getCommerceCover(commerceSlug: string) {
    const commerce = await Commerce.findOne({ where: {slug: commerceSlug, active: true, coverPreset: 'custom'}, attributes: ['coverData','coverMimeType'] });
    if (!commerce?.coverData || !commerce.coverMimeType) throw new NotFoundException('Portada no encontrada');
    return {data: commerce.coverData, mimeType: commerce.coverMimeType};
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
