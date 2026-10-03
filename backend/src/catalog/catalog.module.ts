import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatalogController } from './catalog.controller';
import { CatalogPublicController } from './catalog-public.controller';
import { CatalogService } from './catalog.service';
import { PublicCatalogService } from './public-catalog.service';
import { PublicCartService } from './public-cart.service';
import { PublicCheckoutService } from './public-checkout.service';
import { OrderEmailService } from './order-email.service';
import { MercadoPagoService } from './mercado-pago.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  imports: [AuthModule],
  controllers: [CatalogController, CatalogPublicController],
  providers: [CatalogService, PublicCatalogService, PublicCartService, PublicCheckoutService, OrderEmailService, MercadoPagoService, AuthGuard, RolesGuard],
})
export class CatalogModule {}
