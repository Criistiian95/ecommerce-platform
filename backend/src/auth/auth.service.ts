import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { User } from '../database/models/user.model';
import { Session } from '../database/models/session.model';
import { Commerce } from '../database/models/commerce.model';

@Injectable()
export class AuthService {
  constructor(private readonly db: DatabaseService) {}

  async login(email: string, password: string) {
    const user = await User.findOne({ where: { email, active: true } });
    if (!user) throw new UnauthorizedException('Credenciales inválidas');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Credenciales inválidas');

    const sessionId = randomUUID();
    const expiresIn = (process.env.JWT_EXPIRES_IN ?? '8h') as SignOptions['expiresIn'];
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

  async createInitialAdmin(input: {
    commerceName: string;
    commerceSlug: string;
    adminName: string;
    email: string;
    password: string;
  }) {
    const existingUsers = await User.count();
    if (existingUsers > 0) {
      throw new ConflictException('El alta inicial ya fue utilizada');
    }

    const commerceName = input.commerceName?.trim();
    const commerceSlug = input.commerceSlug?.trim().toLowerCase();
    const adminName = input.adminName?.trim();
    const email = input.email?.trim().toLowerCase();
    const password = input.password ?? '';

    if (!commerceName || !commerceSlug || !adminName || !email || !password) {
      throw new BadRequestException('Faltan datos obligatorios');
    }
    if (password.length < 10) {
      throw new BadRequestException('La contraseña debe tener al menos 10 caracteres');
    }

    const transaction = await this.db.sequelize.transaction();
    try {
      const commerce = await Commerce.create({
        name: commerceName,
        slug: commerceSlug,
        active: true,
      }, { transaction });

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await User.create({
        commerceId: commerce.id,
        email,
        passwordHash,
        name: adminName,
        role: 'admin',
        active: true,
      }, { transaction });

      await transaction.commit();

      return {
        ok: true,
        commerce: {
          id: commerce.id,
          name: commerce.name,
          slug: commerce.slug,
        },
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
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
