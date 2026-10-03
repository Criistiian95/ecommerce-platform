import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CatalogService } from './catalog.service';
import { PublicCatalogService } from './public-catalog.service';

@Controller('catalog')
export class CatalogPublicController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly publicCatalog: PublicCatalogService,
  ) {}

  @Get('store/:slug')
  storefront(@Param('slug') slug: string) {
    return this.publicCatalog.getCatalog(slug);
  }

  @Get('products/:id/image')
  async productImage(@Param('id') id: string, @Res() res: Response) {
    const image = await this.catalog.getProductImage(id);
    res.setHeader('Content-Type', image.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(image.data);
  }
}
