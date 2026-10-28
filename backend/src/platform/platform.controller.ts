import { Body, Controller, Get, Headers, HttpCode, Post, Query, UseGuards, Req } from '@nestjs/common';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { PlatformOwnerService } from './platform-owner.service';
import { PlatformStatisticsService } from './platform-statistics.service';

@Injectable()
export class PlatformOwnerGuard implements CanActivate {
  constructor(private readonly owner: PlatformOwnerService) {}
  canActivate(context: ExecutionContext) { return this.owner.authorize(context.switchToHttp().getRequest().headers.authorization); }
}

@Controller('platform')
export class PlatformController {
  constructor(private readonly stats: PlatformStatisticsService, private readonly owner: PlatformOwnerService) {}
  @Post('visit') @HttpCode(204)
  async visit(@Body() body: { path?: unknown; sessionId?: unknown }, @Headers('user-agent') agent = '', @Req() req: Request) {
    await this.stats.record(body?.path, body?.sessionId, agent, req.ip);
  }
  @Post('owner/code') @HttpCode(200)
  requestCode() { return this.owner.requestCode(); }
  @Post('owner/verify') @HttpCode(200)
  verify(@Body() body: { code?: unknown }) { return this.owner.verifyCode(body?.code); }
  @Post('owner/exclude') @UseGuards(PlatformOwnerGuard) @HttpCode(200)
  exclude(@Body() body: { sessionId?: unknown }, @Req() req: Request) {
    return this.stats.excludeOwner(body?.sessionId, req.ip);
  }
  @Get('statistics') @UseGuards(PlatformOwnerGuard)
  statistics(@Query('period') period?: string) { return this.stats.statistics(period); }
}
