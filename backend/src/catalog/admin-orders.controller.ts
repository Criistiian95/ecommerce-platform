import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { OrderStatus } from '../database/models/order.model';
import { AdminOrdersService } from './admin-orders.service';

@Controller('admin/orders')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin', 'superadmin')
export class AdminOrdersController {
  constructor(private readonly orders: AdminOrdersService) {}

  @Get('summary')
  summary(@Req() req: AuthenticatedRequest) {
    return this.orders.summary(req.auth!.commerceId);
  }

  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.orders.list(req.auth!.commerceId, status, search);
  }

  @Get(':id')
  detail(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.orders.detail(req.auth!.commerceId, id);
  }

  @Patch(':id/status')
  updateStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { status: OrderStatus },
  ) {
    return this.orders.updateStatus(
      req.auth!.commerceId,
      req.auth!.userId,
      id,
      body.status,
    );
  }
}
