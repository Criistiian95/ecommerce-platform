import {BillingModule} from '../billing/billing.module';
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';
import { PasswordRecoveryService } from './password-recovery.service';
import { PasswordRecoveryController } from './password-recovery.controller';
import { RegistrationEmailService } from './registration-email.service';
import { RegistrationEmailWorker } from './registration-email-worker.service';
import { OrderEmailService } from '../catalog/order-email.service';

@Module({
  imports: [BillingModule],
  controllers: [AuthController, PasswordRecoveryController],
  providers: [AuthService, AuthGuard, RolesGuard, PasswordRecoveryService, RegistrationEmailService, RegistrationEmailWorker, OrderEmailService],
  exports: [AuthService],
})
export class AuthModule {}
