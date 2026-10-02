import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CatalogService } from './catalog.service';

@Controller('admin/catalog')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin', 'superadmin')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('categories')
  categories(@Req() req: AuthenticatedRequest) {
    return this.catalog.listCategories(req.auth!.commerceId);
  }

  @Post('categories')
  createCategory(
    @Req() req: AuthenticatedRequest,
    @Body() body: { name: string; description?: string },
  ) {
    return this.catalog.createCategory(req.auth!.commerceId, body);
  }

  @Get('products')
  products(@Req() req: AuthenticatedRequest, @Query('search') search?: string) {
    return this.catalog.listProducts(req.auth!.commerceId, search);
  }

  @Post('products')
  createProduct(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      sku: string;
      name: string;
      description?: string;
      price: number;
      categoryId?: string | null;
      currentStock?: number;
      minimumStock?: number;
      imageUrl?: string;
    },
  ) {
    return this.catalog.createProduct(req.auth!.commerceId, req.auth!.userId, body);
  }

  @Patch('products/:id/stock')
  adjustStock(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { quantityChange: number; reason?: string },
  ) {
    return this.catalog.adjustStock(req.auth!.commerceId, req.auth!.userId, id, body);
  }

  @Get('products/:id/stock-history')
  stockHistory(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.catalog.stockHistory(req.auth!.commerceId, id);
  }
}
