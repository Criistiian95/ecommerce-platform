import { Body, HttpException, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private readonly registrationAttempts = new Map<string,{count:number;expires:number}>();

  @Post('commerce/register')
  registerCommerce(@Req() req:Request, @Body() body:{commerceName:string;commerceSlug:string;adminName:string;email:string;password:string}) {
    const now=Date.now();
    for(const [key,value] of this.registrationAttempts) if(value.expires<=now) this.registrationAttempts.delete(key);
    const key=req.ip || req.socket.remoteAddress || 'unknown';
    const attempt=this.registrationAttempts.get(key) || {count:0,expires:now+60*60*1000};
    if(attempt.count>=10 || (!this.registrationAttempts.has(key) && this.registrationAttempts.size>=5000)) throw new HttpException('Demasiados intentos. Intentá más tarde.',429);
    attempt.count++; this.registrationAttempts.set(key,attempt);
    return this.auth.registerCommerce(body);
  }

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

  @Post('admin/logout')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin','superadmin','operator')
  adminLogout(@Req() req: AuthenticatedRequest) {
    return this.auth.logout(req.auth!.sessionId);
  }

  @Post('logout')
  logout(@Body() body: { sessionId: string }) {
    return this.auth.logout(body.sessionId);
  }
}
