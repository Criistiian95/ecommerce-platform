import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { Session } from '../database/models/session.model';
import { User } from '../database/models/user.model';
import { Commerce } from '../database/models/commerce.model';
import { expiredTrialAccess, trialExpired } from '../billing/trial-policy';

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
      if (payload.commerceId) {
        const commerce = await Commerce.findOne({where:{id:payload.commerceId,active:true},attributes:['id','trialEndsAt','trialConvertedAt']});
        if (!commerce) throw new UnauthorizedException('La tienda está pendiente de pago o suspendida');
        if (trialExpired(commerce) && !expiredTrialAccess(payload.role, request.method, request.originalUrl || request.path)) {
          throw new ForbiddenException({code:'TRIAL_EXPIRED',message:'Tu prueba de 15 días terminó. Tus datos se conservan. Activá el abono desde Mi plan para continuar.'});
        }
      }

      request.auth = {
        userId: payload.sub,
        sessionId: payload.sid,
        role: payload.role,
        commerceId: payload.commerceId,
      };
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw new UnauthorizedException('Token inválido');
    }
  }
}
