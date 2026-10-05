import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminCustomersService } from './admin-customers.service';

@Controller('admin/customers')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin', 'superadmin')
export class AdminCustomersController {
  constructor(private readonly customers: AdminCustomersService) {}

  @Get('summary')
  summary(@Req() req: AuthenticatedRequest) {
    return this.customers.summary(req.auth!.commerceId);
  }

  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Query('search') search?: string,
  ) {
    return this.customers.list(req.auth!.commerceId, search);
  }

  @Get(':key')
  detail(
    @Req() req: AuthenticatedRequest,
    @Param('key') key: string,
  ) {
    return this.customers.detail(req.auth!.commerceId, key);
  }
}
