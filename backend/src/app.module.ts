import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { BillingModule } from './billing/billing.module';
import { PlatformModule } from './platform/platform.module';

@Module({
  imports: [DatabaseModule, AuthModule, CatalogModule, BillingModule, PlatformModule],
  controllers: [AppController],
})
export class AppModule {}
