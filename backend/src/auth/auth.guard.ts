import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { Session } from '../database/models/session.model';
import { User } from '../database/models/user.model';
import { Commerce } from '../database/models/commerce.model';

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

      if (!session || session.revokedAt || session.expiresAt < new Date() || session.userId !== payload.sub) {
        throw new UnauthorizedException('Sesión inválida');
      }
      const user = await User.findOne({
        where: { id: payload.sub, active: true, role: payload.role, commerceId: payload.commerceId },
        attributes: ['id'],
      });
      if (!user) throw new UnauthorizedException('Sesión inválida');
      if (payload.commerceId && !await Commerce.findOne({ where: { id: payload.commerceId, active: true } })) throw new UnauthorizedException('Tienda pendiente de pago o suspendida');

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
