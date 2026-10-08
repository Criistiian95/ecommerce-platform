import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('setup-initial-admin')
  createInitialAdmin(
    @Body()
    body: {
      commerceName: string;
      commerceSlug: string;
      adminName: string;
      email: string;
      password: string;
    },
  ) {
    return this.auth.createInitialAdmin(body);
  }

  @Post('login')
  login(@Body() body: { email: string; password: string; commerceSlug?: string }) {
    return this.auth.login(body.email?.trim().toLowerCase(), body.password, body.commerceSlug);
  }


  @Post('customer/register')
  registerCustomer(
    @Body()
    body: {
      commerceSlug: string;
      name: string;
      email: string;
      password: string;
      phone?: string | null;
      defaultAddress?: string | null;
    },
  ) {
    return this.auth.registerCustomer(body);
  }

  @Post('customer/login')
  loginCustomer(
    @Body()
    body: { commerceSlug: string; email: string; password: string },
  ) {
    return this.auth.loginCustomer(
      body.commerceSlug,
      body.email?.trim().toLowerCase(),
      body.password,
    );
  }

  @Post('customer/logout')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('customer')
  customerLogout(@Req() req: AuthenticatedRequest) {
    return this.auth.logout(req.auth!.sessionId);
  }

  @Get('customer/me')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('customer')
  customerMe(@Req() req: AuthenticatedRequest) {
    return this.auth.customerProfile(req.auth!.userId);
  }

  @Patch('customer/me')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('customer')
  updateCustomerMe(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      name?: string;
      phone?: string | null;
      defaultAddress?: string | null;
    },
  ) {
    return this.auth.updateCustomerProfile(req.auth!.userId, body);
  }

  @Post('logout')
  logout(@Body() body: { sessionId: string }) {
    return this.auth.logout(body.sessionId);
  }
}
