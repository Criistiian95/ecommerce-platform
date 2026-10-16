import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Commerce } from '../database/models/commerce.model';

export type CommerceSettingsInput = {
  heroTitle?: string | null;
  heroButtonText?: string | null;
  announcementText?: string | null;
  heroLayout?: string;
  backgroundColor?: string;
  coverPreset?: string;
  coverDataBase64?: string;
  coverMimeType?: string;
  name?: string;
  tagline?: string | null;
  fontFamily?: string;
  primaryColor?: string;
  secondaryColor?: string;
  logoUrl?: string | null;
  logoDataBase64?: string | null;
  logoMimeType?: string | null;
  clearUploadedLogo?: boolean;
  whatsapp?: string | null;
  salesEmail?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  address?: string | null;
  businessHours?: string | null;
  pickupEnabled?: boolean;
  shippingEnabled?: boolean;
};

@Injectable()
export class AdminCommerceSettingsService {
  private requireCommerce(commerceId: string | null) {
    if (!commerceId) throw new ForbiddenException('El usuario no pertenece a un comercio');
    return commerceId;
  }

  private decodeLogo(input: CommerceSettingsInput) {
    if(input.logoDataBase64 != null && typeof input.logoDataBase64!=='string') throw new BadRequestException('Logo inválido');
    if(input.logoMimeType != null && typeof input.logoMimeType!=='string') throw new BadRequestException('Formato inválido');
    const base64 = input.logoDataBase64?.trim();
    const mime = input.logoMimeType?.trim().toLowerCase();

    if (!base64) return null;

    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!mime || !allowed.includes(mime)) {
      throw new BadRequestException('Formato de logo no permitido');
    }

    const buffer = Buffer.from(base64, 'base64');
    if (!buffer.length) throw new BadRequestException('Logo inválido');
    if (buffer.length > 2 * 1024 * 1024) {
      throw new BadRequestException('El logo no puede superar 2 MB');
    }

    return { buffer, mime };
  }

  private decodeCover(input: CommerceSettingsInput) {
    if (input.coverDataBase64 === undefined) return null;
    const value = input.coverDataBase64;
    const mime = input.coverMimeType;
    if (typeof value !== 'string' || !value.length || value.length > 2800000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value) || !['image/png','image/jpeg','image/webp'].includes(mime || '')) throw new BadRequestException('Portada inválida: usá JPG, PNG o WebP de hasta 2 MB');
    const buffer = Buffer.from(value, 'base64');
    const valid = mime === 'image/png' ? buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : mime === 'image/jpeg' ? buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255 : buffer.toString('ascii',0,4) === 'RIFF' && buffer.toString('ascii',8,12) === 'WEBP';
    if (!valid || buffer.length > 2 * 1024 * 1024) throw new BadRequestException('Portada inválida: usá JPG, PNG o WebP de hasta 2 MB');
    return {buffer, mime: mime!};
  }

  private validateColor(value: string | undefined, label: string) {
    if (value === undefined) return;
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
      throw new BadRequestException(`${label} debe ser un color hexadecimal válido`);
    }
  }

  private sanitize(commerce: Commerce) {
    const plain = commerce.get({ plain: true }) as any;
    const hasUploadedLogo = Boolean(plain.logoData);
    delete plain.logoData;

    return {
      updatedAt: plain.updatedAt,
      id: plain.id,
      name: plain.name,
      slug: plain.slug,
      tagline: plain.tagline,
      heroTitle: plain.heroTitle,
      heroButtonText: plain.heroButtonText,
      announcementText: plain.announcementText,
      heroLayout: plain.heroLayout,
      fontFamily: plain.fontFamily,
      backgroundColor: plain.backgroundColor,
      coverPreset: plain.coverPreset,
      hasUploadedCover: Boolean(plain.coverData),
      primaryColor: plain.primaryColor,
      secondaryColor: plain.secondaryColor,
      logoUrl: plain.logoUrl,
      logoMimeType: plain.logoMimeType,
      hasUploadedLogo,
      whatsapp: plain.whatsapp,
      salesEmail: plain.salesEmail,
      contactEmail: plain.contactEmail,
      contactPhone: plain.contactPhone,
      address: plain.address,
      businessHours: plain.businessHours,
      pickupEnabled: Boolean(plain.pickupEnabled),
      shippingEnabled: Boolean(plain.shippingEnabled),
    };
  }

  async getSettings(commerceId: string | null) {
    const commerce = await Commerce.findByPk(this.requireCommerce(commerceId));
    if (!commerce) throw new NotFoundException('Comercio no encontrado');
    return this.sanitize(commerce);
  }

  async updateSettings(commerceId: string | null, input: CommerceSettingsInput) {
    if (!input || typeof input !== 'object') throw new BadRequestException('Configuración inválida');
    const commerce = await Commerce.findByPk(this.requireCommerce(commerceId));
    if (!commerce) throw new NotFoundException('Comercio no encontrado');

    if(input.heroLayout!==undefined && !['split','banner'].includes(input.heroLayout)) throw new BadRequestException('Diseño de portada inválido');
    if(input.fontFamily!==undefined && !['modern','classic','friendly','mono'].includes(input.fontFamily)) throw new BadRequestException('Tipografía inválida');
    this.validateColor(input.backgroundColor, 'El color de fondo');
    if (input.coverPreset !== undefined && !['none','oak','workshop','home','custom'].includes(input.coverPreset)) throw new BadRequestException('Portada inválida');
    const cover = this.decodeCover(input);
    if (cover && input.coverPreset !== 'custom') throw new BadRequestException('Elegí la portada personalizada para subir una imagen');
    if (input.coverPreset === 'custom' && !cover && !commerce.coverData) throw new BadRequestException('Subí una imagen para la portada');
    this.validateColor(input.primaryColor, 'El color principal');
    this.validateColor(input.secondaryColor, 'El color secundario');

    for (const [key,limit] of [['heroTitle',180],['heroButtonText',40],['announcementText',160],['name',120],['tagline',180],['logoUrl',500]] as const) {
      const value=input[key];
      if(value!==undefined && value!==null && (typeof value!=='string' || value.length>limit)) throw new BadRequestException('Texto inválido o demasiado largo');
    }
    if(input.logoUrl) {
      try { const url=new URL(input.logoUrl); if(!['https:','http:'].includes(url.protocol)) throw new Error(); }
      catch { throw new BadRequestException('La URL del logo debe comenzar con https:// o http://'); }
    }
    const logo = this.decodeLogo(input);
    const name = input.name?.trim();
    if (input.name !== undefined && !name) {
      throw new BadRequestException('El nombre comercial es obligatorio');
    }

    const pickupEnabled =
      input.pickupEnabled !== undefined ? Boolean(input.pickupEnabled) : commerce.pickupEnabled;
    const shippingEnabled =
      input.shippingEnabled !== undefined ? Boolean(input.shippingEnabled) : commerce.shippingEnabled;

    if (!pickupEnabled && !shippingEnabled) {
      throw new BadRequestException('Debe quedar habilitada al menos una modalidad de entrega');
    }

    if (input.salesEmail !== undefined && input.salesEmail !== null &&
        (typeof input.salesEmail !== 'string' || (input.salesEmail.trim() &&
        (input.salesEmail.trim().length > 190 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.salesEmail.trim()))))) {
      throw new BadRequestException('El email para avisos de venta no es válido');
    }
    await commerce.update({
      ...(input.heroTitle !== undefined ? {heroTitle: input.heroTitle?.trim() || null} : {}),
      ...(input.heroButtonText !== undefined ? {heroButtonText: input.heroButtonText?.trim() || null} : {}),
      ...(input.announcementText !== undefined ? {announcementText: input.announcementText?.trim() || null} : {}),
      ...(input.heroLayout !== undefined ? {heroLayout: input.heroLayout} : {}),
      ...(input.backgroundColor !== undefined ? { backgroundColor: input.backgroundColor } : {}),
      ...(input.coverPreset !== undefined ? { coverPreset: input.coverPreset } : {}),
      ...(cover ? { coverData: cover.buffer, coverMimeType: cover.mime } : {}),
      ...(input.coverPreset !== undefined && input.coverPreset !== 'custom' ? { coverData: null, coverMimeType: null } : {}),
      ...(input.fontFamily!==undefined ? {fontFamily:input.fontFamily} : {}),
      ...(input.salesEmail !== undefined ? { salesEmail: input.salesEmail?.trim().toLowerCase() || null } : {}),
      ...(name !== undefined ? { name } : {}),
      ...(input.tagline !== undefined ? { tagline: input.tagline?.trim() || null } : {}),
      ...(input.primaryColor !== undefined ? { primaryColor: input.primaryColor } : {}),
      ...(input.secondaryColor !== undefined ? { secondaryColor: input.secondaryColor } : {}),
      ...(input.logoUrl !== undefined && !logo ? { logoUrl: input.logoUrl?.trim() || null } : {}),
      ...(logo
        ? { logoUrl: null, logoData: logo.buffer, logoMimeType: logo.mime }
        : {}),
      ...(!logo && (input.clearUploadedLogo || input.logoUrl?.trim()) ? { logoData: null, logoMimeType: null } : {}),
      ...(input.whatsapp !== undefined ? { whatsapp: input.whatsapp?.trim() || null } : {}),
      ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail?.trim() || null } : {}),
      ...(input.contactPhone !== undefined ? { contactPhone: input.contactPhone?.trim() || null } : {}),
      ...(input.address !== undefined ? { address: input.address?.trim() || null } : {}),
      ...(input.businessHours !== undefined ? { businessHours: input.businessHours?.trim() || null } : {}),
      ...(input.pickupEnabled !== undefined ? { pickupEnabled } : {}),
      ...(input.shippingEnabled !== undefined ? { shippingEnabled } : {}),
    });

    return this.sanitize(commerce);
  }

  async getLogo(commerceSlug: string) {
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
