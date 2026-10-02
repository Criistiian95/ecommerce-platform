import { Injectable, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { User } from '../database/models/user.model';
import { Session } from '../database/models/session.model';

@Injectable()
export class AuthService {
  constructor(private readonly db: DatabaseService) {}

  async login(email: string, password: string) {
    const user = await User.findOne({ where: { email, active: true } });
    if (!user) throw new UnauthorizedException('Credenciales inválidas');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Credenciales inválidas');

    const sessionId = randomUUID();
    const expiresIn = process.env.JWT_EXPIRES_IN ?? '8h';
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);

    await Session.create({
      id: sessionId,
      userId: user.id,
      expiresAt,
      revokedAt: null,
    });

    const token = jwt.sign(
      {
        sub: user.id,
        sid: sessionId,
        role: user.role,
        commerceId: user.commerceId,
      },
      process.env.JWT_SECRET as string,
      { expiresIn },
    );

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        commerceId: user.commerceId,
      },
    };
  }

  async logout(sessionId: string) {
    const session = await Session.findByPk(sessionId);
    if (session && !session.revokedAt) {
      session.revokedAt = new Date();
      await session.save();
    }
    return { ok: true };
  }

  verifyToken(token: string) {
    return jwt.verify(token, process.env.JWT_SECRET as string) as {
      sub: string;
      sid: string;
      role: string;
      commerceId: string | null;
    };
  }
}
