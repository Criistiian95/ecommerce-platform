import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminCommerceSettingsService } from './admin-commerce-settings.service';

@Controller('admin/commerce')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin', 'superadmin')
export class AdminCommerceSettingsController {
  constructor(private readonly settings: AdminCommerceSettingsService) {}

  @Get('settings')
  getSettings(@Req() req: AuthenticatedRequest) {
    return this.settings.getSettings(req.auth!.commerceId);
  }

  @Patch('settings')
  updateSettings(
    @Req() req: AuthenticatedRequest,
    @Body() body: {
      name?: string;
      tagline?: string | null;
      primaryColor?: string;
      secondaryColor?: string;
      logoUrl?: string | null;
      logoDataBase64?: string | null;
      logoMimeType?: string | null;
      clearUploadedLogo?: boolean;
      whatsapp?: string | null;
      contactEmail?: string | null;
      contactPhone?: string | null;
      address?: string | null;
      businessHours?: string | null;
      pickupEnabled?: boolean;
      shippingEnabled?: boolean;
    },
  ) {
    return this.settings.updateSettings(req.auth!.commerceId, body);
  }
}
