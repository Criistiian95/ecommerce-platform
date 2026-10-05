import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { Op } from 'sequelize';
import { DatabaseService } from '../database/database.service';
import { User } from '../database/models/user.model';
import { Session } from '../database/models/session.model';
import { Commerce } from '../database/models/commerce.model';

@Injectable()
export class AuthService {
  constructor(private readonly db: DatabaseService) {}

  private async createSession(user: User) {
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
        phone: user.phone,
        defaultAddress: user.defaultAddress,
        role: user.role,
        commerceId: user.commerceId,
      },
    };
  }

  async login(email: string, password: string) {
    const user = await User.findOne({
      where: {
        email,
        active: true,
        role: { [Op.in]: ['admin', 'superadmin', 'operator'] },
      },
    });
    if (!user) throw new UnauthorizedException('Credenciales inválidas');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Credenciales inválidas');

    return this.createSession(user);
  }

  async registerCustomer(input: {
    commerceSlug: string;
    name: string;
    email: string;
    password: string;
    phone?: string | null;
    defaultAddress?: string | null;
  }) {
    const commerce = await Commerce.findOne({
      where: { slug: input.commerceSlug?.trim().toLowerCase(), active: true },
    });
    if (!commerce) throw new BadRequestException('Comercio no encontrado');

    const name = input.name?.trim();
    const email = input.email?.trim().toLowerCase();
    const password = input.password ?? '';
    const phone = input.phone?.trim() || null;
    const defaultAddress = input.defaultAddress?.trim() || null;

    if (!name || !email || !password) {
      throw new BadRequestException('Nombre, email y contraseña son obligatorios');
    }
    if (!email.includes('@')) throw new BadRequestException('Email inválido');
    if (password.length < 8) {
      throw new BadRequestException('La contraseña debe tener al menos 8 caracteres');
    }

    const existing = await User.findOne({
      where: { commerceId: commerce.id, email },
    });
    if (existing) throw new ConflictException('Ya existe una cuenta con ese email');

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      commerceId: commerce.id,
      email,
      passwordHash,
      name,
      phone,
      defaultAddress,
      role: 'customer',
      active: true,
    });

    await Order.update(
      { customerId: user.id },
      {
        where: {
          commerceId: commerce.id,
          customerId: null,
          customerEmail: email,
        },
      },
    );

    return this.createSession(user);
  }

  async loginCustomer(commerceSlug: string, email: string, password: string) {
    const commerce = await Commerce.findOne({
      where: { slug: commerceSlug?.trim().toLowerCase(), active: true },
      attributes: ['id'],
    });
    if (!commerce) throw new UnauthorizedException('Credenciales inválidas');

    const user = await User.findOne({
      where: {
        commerceId: commerce.id,
        email: email?.trim().toLowerCase(),
        role: 'customer',
        active: true,
      },
    });
    if (!user) throw new UnauthorizedException('Credenciales inválidas');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Credenciales inválidas');

    return this.createSession(user);
  }

  async customerProfile(userId: string) {
    const user = await User.findOne({
      where: { id: userId, role: 'customer', active: true },
      attributes: ['id', 'commerceId', 'name', 'email', 'phone', 'defaultAddress', 'role'],
    });
    if (!user) throw new UnauthorizedException('Cliente inválido');

    return {
      id: user.id,
      commerceId: user.commerceId,
      name: user.name,
      email: user.email,
      phone: user.phone,
      defaultAddress: user.defaultAddress,
      role: user.role,
    };
  }

  async updateCustomerProfile(
    userId: string,
    input: { name?: string; phone?: string | null; defaultAddress?: string | null },
  ) {
    const user = await User.findOne({
      where: { id: userId, role: 'customer', active: true },
    });
    if (!user) throw new UnauthorizedException('Cliente inválido');

    const name = input.name !== undefined ? input.name.trim() : undefined;
    if (input.name !== undefined && !name) {
      throw new BadRequestException('El nombre no puede quedar vacío');
    }

    await user.update({
      ...(name !== undefined ? { name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
      ...(input.defaultAddress !== undefined
        ? { defaultAddress: input.defaultAddress?.trim() || null }
        : {}),
    });

    return this.customerProfile(user.id);
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
