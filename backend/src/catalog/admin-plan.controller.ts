import { Body, Controller, Get, Header, HttpCode, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { BillingService } from '../billing/billing.service';
import { AdminPlanService } from './admin-plan.service';

@Controller('admin/plan')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin', 'superadmin')
export class AdminPlanController {
  constructor(private readonly plans: AdminPlanService, private readonly billing: BillingService) {}

  @Post('checkout')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  checkout(@Req() req: AuthenticatedRequest, @Body() body: { acceptedMonthly?: boolean; amountArs?: number }) {
    return this.billing.preparePlanCheckout(req.auth!.commerceId, req.auth!.userId, body?.acceptedMonthly === true, body?.amountArs!);
  }

  @Post('sync')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  async sync(@Req() req: AuthenticatedRequest) {
    return this.billing.refreshPlanPayment(req.auth!.commerceId);
  }

  @Get()
  @Header('Cache-Control', 'private, no-store')
  getPlan(@Req() req: AuthenticatedRequest, @Query('page') page?: string) {
    // Never accept a commerceId supplied in a URL or request body.
    return this.plans.getPlan(req.auth!.commerceId, page === undefined ? 1 : Number(page));
  }
}
