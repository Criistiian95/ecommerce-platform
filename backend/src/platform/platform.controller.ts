import { Body, Controller, Delete, Get, Headers, HttpCode, Post, Query, UseGuards, Req } from '@nestjs/common';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { PlatformOwnerService } from './platform-owner.service';
import { PlatformStatisticsService } from './platform-statistics.service';

@Injectable()
export class PlatformOwnerGuard implements CanActivate {
  constructor(private readonly owner: PlatformOwnerService) {}
  canActivate(context: ExecutionContext) { return this.owner.authorize(context.switchToHttp().getRequest().headers.authorization); }
}

// Render's Cloudflare edge overwrites CF-Connecting-IP for public web requests.
// Do not trust arbitrary X-Forwarded-For entries or apply this to other auth flows.
function visitorIp(req: Request): string | undefined {
  return typeof req.headers['cf-connecting-ip'] === 'string' ? req.headers['cf-connecting-ip'] : undefined;
}

@Controller('platform')
export class PlatformController {
  constructor(private readonly stats: PlatformStatisticsService, private readonly owner: PlatformOwnerService) {}
  @Post('visit') @HttpCode(204)
  async visit(@Body() body: { path?: unknown; sessionId?: unknown; browserId?: unknown }, @Headers('user-agent') agent = '', @Req() req: Request) {
    await this.stats.record(body?.path, body?.sessionId, agent, new Date(), visitorIp(req), body?.browserId);
  }
  @Post('owner/code') @HttpCode(200)
  requestCode() { return this.owner.requestCode(); }
  @Post('owner/verify') @HttpCode(200)
  verify(@Body() body: { code?: unknown }) { return this.owner.verifyCode(body?.code); }
  @Post('owner/exclude') @UseGuards(PlatformOwnerGuard) @HttpCode(200)
  exclude(@Body() body: { sessionId?: unknown }, @Req() req: Request) {
    return this.stats.excludeOwner(body?.sessionId, visitorIp(req));
  }
  @Get('owner/excluded-ips') @UseGuards(PlatformOwnerGuard)
  excludedIps(@Req() req: Request) { return this.stats.excludedIps(visitorIp(req)); }
  @Post('owner/excluded-ips') @UseGuards(PlatformOwnerGuard) @HttpCode(200)
  addExcludedIp(@Body() body: { ip?: unknown; label?: unknown; browserId?: unknown }) {
    return this.stats.addExcludedIp(body?.ip, body?.label, body?.browserId);
  }
  @Delete('owner/excluded-ips') @UseGuards(PlatformOwnerGuard)
  removeExcludedIp(@Body() body: { ip?: unknown }) { return this.stats.removeExcludedIp(body?.ip); }
  @Get('statistics') @UseGuards(PlatformOwnerGuard)
  statistics(@Query('period') period?: string) { return this.stats.statistics(period); }
}
