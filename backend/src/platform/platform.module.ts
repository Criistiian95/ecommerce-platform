import { Module } from '@nestjs/common';
import { OrderEmailService } from '../catalog/order-email.service';
import { PlatformController, PlatformOwnerGuard } from './platform.controller';
import { PlatformOwnerService } from './platform-owner.service';
import { PlatformStatisticsService } from './platform-statistics.service';

@Module({ controllers: [PlatformController], providers: [PlatformOwnerGuard, PlatformOwnerService, PlatformStatisticsService, OrderEmailService] })
export class PlatformModule {}
