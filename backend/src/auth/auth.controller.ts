import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.auth.login(body.email?.trim().toLowerCase(), body.password);
  }

  @Post('logout')
  logout(@Body() body: { sessionId: string }) {
    return this.auth.logout(body.sessionId);
  }
}
