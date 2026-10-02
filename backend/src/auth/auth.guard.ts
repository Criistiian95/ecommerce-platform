import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { Session } from '../database/models/session.model';

export type AuthenticatedRequest = Request & {
  auth?: {
    userId: string;
    sessionId: string;
    role: string;
    commerceId: string | null;
  };
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Falta token');
    }

    const token = header.slice(7);
    try {
      const payload = this.authService.verifyToken(token);
      const session = await Session.findByPk(payload.sid);

      if (!session || session.revokedAt || session.expiresAt < new Date()) {
        throw new UnauthorizedException('Sesión inválida');
      }

      request.auth = {
        userId: payload.sub,
        sessionId: payload.sid,
        role: payload.role,
        commerceId: payload.commerceId,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Token inválido');
    }
  }
}
