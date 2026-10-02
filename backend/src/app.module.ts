import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';

@Module({
  imports: [DatabaseModule, AuthModule, CatalogModule],
  controllers: [AppController],
})
export class AppModule {}
