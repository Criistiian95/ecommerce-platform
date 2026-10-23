import { Controller, Get, Header, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminPlanService } from './admin-plan.service';

@Controller('admin/plan')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin', 'superadmin')
export class AdminPlanController {
  constructor(private readonly plans: AdminPlanService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  getPlan(@Req() req: AuthenticatedRequest, @Query('page') page?: string) {
    // Never accept a commerceId supplied in a URL or request body.
    return this.plans.getPlan(req.auth!.commerceId, page === undefined ? 1 : Number(page));
  }
}
