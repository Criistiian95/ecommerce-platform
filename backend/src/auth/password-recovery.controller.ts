import { Body, Controller, Header, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { PasswordRecoveryService } from './password-recovery.service';

@Controller('auth/password')
export class PasswordRecoveryController {
  constructor(private readonly recovery: PasswordRecoveryService) {}
  @Post('request') @HttpCode(202) @Header('Cache-Control', 'no-store')
  request(@Body() body: unknown, @Req() req: Request) {
    // Use Express' observed address; never trust arbitrary X-Forwarded-For headers.
    return this.recovery.request(body, req.ip || req.socket.remoteAddress || 'unknown');
  }
  @Post('reset') @HttpCode(200) @Header('Cache-Control', 'no-store')
  reset(@Body() body: unknown, @Req() req: Request) {
    return this.recovery.reset(body, req.ip || req.socket.remoteAddress || 'unknown');
  }
}
