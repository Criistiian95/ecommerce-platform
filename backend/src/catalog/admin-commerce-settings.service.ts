import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Commerce } from '../database/models/commerce.model';

type CommerceSettingsInput = {
  name?: string;
  tagline?: string | null;
  primaryColor?: string;
  secondaryColor?: string;
  logoUrl?: string | null;
  logoDataBase64?: string | null;
  logoMimeType?: string | null;
  clearUploadedLogo?: boolean;
  whatsapp?: string | null;
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
      id: plain.id,
      name: plain.name,
      slug: plain.slug,
      tagline: plain.tagline,
      primaryColor: plain.primaryColor,
      secondaryColor: plain.secondaryColor,
      logoUrl: plain.logoUrl,
      logoMimeType: plain.logoMimeType,
      hasUploadedLogo,
      whatsapp: plain.whatsapp,
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
    const commerce = await Commerce.findByPk(this.requireCommerce(commerceId));
    if (!commerce) throw new NotFoundException('Comercio no encontrado');

    this.validateColor(input.primaryColor, 'El color principal');
    this.validateColor(input.secondaryColor, 'El color secundario');

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

    await commerce.update({
      ...(name !== undefined ? { name } : {}),
      ...(input.tagline !== undefined ? { tagline: input.tagline?.trim() || null } : {}),
      ...(input.primaryColor !== undefined ? { primaryColor: input.primaryColor } : {}),
      ...(input.secondaryColor !== undefined ? { secondaryColor: input.secondaryColor } : {}),
      ...(input.logoUrl !== undefined && !logo ? { logoUrl: input.logoUrl?.trim() || null } : {}),
      ...(logo
        ? { logoUrl: null, logoData: logo.buffer, logoMimeType: logo.mime }
        : {}),
      ...(input.clearUploadedLogo ? { logoData: null, logoMimeType: null } : {}),
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
