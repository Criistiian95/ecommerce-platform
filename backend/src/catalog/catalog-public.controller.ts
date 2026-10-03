import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CatalogService } from './catalog.service';
import { PublicCatalogService } from './public-catalog.service';
import { PublicCartService } from './public-cart.service';

@Controller('catalog')
export class CatalogPublicController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly publicCatalog: PublicCatalogService,
    private readonly publicCart: PublicCartService,
  ) {}

  @Get('store/:slug')
  storefront(@Param('slug') slug: string) {
    return this.publicCatalog.getCatalog(slug);
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

  @Get('products/:id/image')
  async productImage(@Param('id') id: string, @Res() res: Response) {
    const image = await this.catalog.getProductImage(id);
    res.setHeader('Content-Type', image.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(image.data);
  }
}
