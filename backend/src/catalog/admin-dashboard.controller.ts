import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminDashboardService } from './admin-dashboard.service';

@Controller('admin/dashboard')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin', 'superadmin')
export class AdminDashboardController {
  constructor(private readonly dashboard: AdminDashboardService) {}

  @Get()
  getDashboard(
    @Req() req: AuthenticatedRequest,
    @Query('days') days?: string,
  ) {
    return this.dashboard.getDashboard(
      req.auth!.commerceId,
      days ? Number(days) : undefined,
    );
  }
}
