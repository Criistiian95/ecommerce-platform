import { MpConnectionService } from './mp-connection.service';
import { MpConnectionController } from './mp-connection.controller';
import { OrderEmailWorker } from './order-email-worker.service';
import { ReservationWorker } from './reservation-worker.service';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatalogController } from './catalog.controller';
import { CatalogPublicController } from './catalog-public.controller';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminCustomersController } from './admin-customers.controller';
import { CustomerAccountController } from './customer-account.controller';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminCommerceSettingsController } from './admin-commerce-settings.controller';
import { CatalogService } from './catalog.service';
import { PublicCatalogService } from './public-catalog.service';
import { PublicCartService } from './public-cart.service';
import { PublicCheckoutService } from './public-checkout.service';
import { OrderEmailService } from './order-email.service';
import { MercadoPagoService } from './mercado-pago.service';
import { AdminOrdersService } from './admin-orders.service';
import { AdminCustomersService } from './admin-customers.service';
import { CustomerAccountService } from './customer-account.service';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminCommerceSettingsService } from './admin-commerce-settings.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  imports: [AuthModule],
  controllers: [MpConnectionController, CatalogController, CatalogPublicController, AdminOrdersController, AdminCustomersController, CustomerAccountController, AdminDashboardController, AdminCommerceSettingsController],
  providers: [MpConnectionService, OrderEmailWorker, ReservationWorker, CatalogService, PublicCatalogService, PublicCartService, PublicCheckoutService, OrderEmailService, MercadoPagoService, AdminOrdersService, AdminCustomersService, CustomerAccountService, AdminDashboardService, AdminCommerceSettingsService, AuthGuard, RolesGuard],
})
export class CatalogModule {}
