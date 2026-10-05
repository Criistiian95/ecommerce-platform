import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CustomerAccountService } from './customer-account.service';

@Controller('customer/account')
@UseGuards(AuthGuard, RolesGuard)
@Roles('customer')
export class CustomerAccountController {
  constructor(private readonly account: CustomerAccountService) {}

  @Get('orders')
  orders(@Req() req: AuthenticatedRequest) {
    return this.account.orders(req.auth!.userId, req.auth!.commerceId);
  }
}
