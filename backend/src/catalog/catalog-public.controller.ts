import { Body, Controller, Get, Headers, HttpCode, NotFoundException, Param, Post, Query, Res, UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import { CatalogService } from './catalog.service';
import { PublicCatalogService } from './public-catalog.service';
import { PublicCartService } from './public-cart.service';
import { PublicCheckoutService } from './public-checkout.service';
import { MercadoPagoService } from './mercado-pago.service';
import { AuthService } from '../auth/auth.service';

@Controller('catalog')
export class CatalogPublicController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly publicCatalog: PublicCatalogService,
    private readonly publicCart: PublicCartService,
    private readonly publicCheckout: PublicCheckoutService,
    private readonly mercadoPago: MercadoPagoService,
    private readonly authService: AuthService,
  ) {}

  @Get('store/:slug')
  storefront(@Param('slug') slug: string) {
    return this.publicCatalog.getCatalog(slug);
  }

  @Get('store/:slug/logo')
  async commerceLogo(@Param('slug') slug: string, @Res() res: Response) {
    const logo = await this.publicCatalog.getCommerceLogo(slug);
    res.setHeader('Content-Type', logo.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(logo.data);
  }

  @Get('store/:slug/products/:id')
  productDetail(@Param('slug') slug: string, @Param('id') id: string) {
    return this.publicCart.getProduct(slug, id);
  }

  @Post('store/:slug/cart/validate')
  validateCart(
    @Param('slug') slug: string,
    @Body() body: { items?: Array<{ productId: string; quantity: number }> },
  ) {
    return this.publicCart.validateCart(slug, body.items ?? []);
  }

  @Post('store/:slug/checkout')
  async checkout(
    @Param('slug') slug: string,
    @Headers('authorization') authorization: string | undefined,
    @Body()
    body: {
      checkoutKey: string;
      customerName: string;
      customerEmail: string;
      customerPhone: string;
      deliveryMethod: 'pickup' | 'shipping';
      address?: string | null;
      notes?: string | null;
      items?: Array<{ productId: string; quantity: number }>;
    },
  ) {
    const customer = await this.authService.resolveCustomerAuthorization(
      authorization,
      slug,
    );

    return this.publicCheckout.createOrder(
      slug,
      {
        ...body,
        items: body.items ?? [],
      },
      customer?.id ?? null,
    );
  }


  @Get('store/:slug/orders/:id/status')
  async orderStatus(@Param('slug') slug: string, @Param('id') id: string) {
    const status = await this.mercadoPago.getPublicOrderStatus(slug, id);
    if (!status) throw new NotFoundException('Pedido no encontrado');
    return status;
  }

  @Post('mercadopago/webhook')
  @HttpCode(200)
  async mercadoPagoWebhook(
    @Headers('x-signature') xSignature: string | undefined,
    @Headers('x-request-id') xRequestId: string | undefined,
    @Query('data.id') queryDataId: string | undefined,
    @Body() body: { data?: { id?: string }; type?: string; user_id?: number | string },
  ) {
    const dataId = queryDataId ?? body?.data?.id;
    const valid = this.mercadoPago.validateWebhookSignature(
      xSignature,
      xRequestId,
      dataId,
    );

    if (!valid) {
      throw new UnauthorizedException('Firma de webhook inválida');
    }

    if (dataId && (!body?.type || body.type === 'payment')) {
      await this.mercadoPago.processPaymentNotification(dataId, undefined, String(body.user_id ?? ''));
    }

    return { ok: true };
  }

  @Get('products/:id/image')
  async productImage(@Param('id') id: string, @Res() res: Response) {
    const image = await this.catalog.getProductImage(id);
    res.setHeader('Content-Type', image.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(image.data);
  }
}
