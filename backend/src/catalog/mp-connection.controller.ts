import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { MpConnectionService } from './mp-connection.service';
@Controller('admin/commerce/payments')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin', 'superadmin')
export class MpConnectionController {
  constructor(private readonly connection: MpConnectionService) {}
  private commerce(req: AuthenticatedRequest) {
    if (!req.auth?.commerceId) throw new BadRequestException('El usuario no tiene un comercio asignado');
    return req.auth.commerceId;
  }
  @Get() status(@Req() req: AuthenticatedRequest) { return this.connection.status(this.commerce(req)); }
  @Post('connect') start(@Req() req: AuthenticatedRequest) { return this.connection.start(this.commerce(req), req.auth!.userId); }
  @Post('complete') finish(@Req() req: AuthenticatedRequest, @Body() body: { state: string; code: string }) {
    return this.connection.finish(this.commerce(req), req.auth!.userId, body.state, body.code);
  }
}
