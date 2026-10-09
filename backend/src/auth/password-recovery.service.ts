import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { Op, QueryTypes, Transaction } from 'sequelize';
import { DatabaseService } from '../database/database.service';
import { Commerce } from '../database/models/commerce.model';
import { User } from '../database/models/user.model';
import { Session } from '../database/models/session.model';

const GENERIC = 'Si los datos corresponden a una cuenta habilitada, recibirás un enlace por email. Revisá también spam.';
const INVALID = 'El enlace no es válido o venció. Solicitá uno nuevo.';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
type Scope = { email: string; slug: string; audience: 'customer' | 'admin' };
type Reset = { token_hash: string; user_id: string; commerce_id: string; audience: string; password_fingerprint: string; expires_at: Date };
type Job = Scope & { id: string; attempts: number };

@Injectable()
export class PasswordRecoveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PasswordRecoveryService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(private readonly db: DatabaseService) {}
  onModuleInit() {
    this.timer = setInterval(() => { void this.drain(); }, 5000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  private query<T extends object>(sql: string, replacements: Record<string, unknown> = {}, transaction?: Transaction) {
    return this.db.sequelize.query<T>(sql, { replacements, transaction, type: QueryTypes.SELECT });
  }
  private async execute(sql: string, replacements: Record<string, unknown> = {}, transaction?: Transaction) {
    await this.db.sequelize.query(sql, { replacements, transaction, logging: false });
  }
  private origin() {
    const url = new URL(process.env.PASSWORD_RESET_ORIGIN || process.env.FRONTEND_URL || '');
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Invalid reset origin');
    return url.origin;
  }
  private configured() {
    try { this.origin(); return !!process.env.RESEND_API_KEY && !!process.env.ORDER_EMAIL_FROM; }
    catch { return false; }
  }
  // Fixed windows stored in MySQL: limits survive restarts and apply across replicas.
  private async allowed(key: string, maximum: number) {
    const window = Math.floor(Date.now() / 900000);
    const bucket = digest(`${key}:${window}`);
    return this.db.sequelize.transaction(async transaction => {
      await this.execute(`INSERT INTO password_reset_limits(bucket,hits,expires_at) VALUES (:bucket,1,:expiry)
        ON DUPLICATE KEY UPDATE hits=LEAST(hits+1,1000000)`,
      { bucket, expiry: new Date((window + 2) * 900000) }, transaction);
      const [row] = await this.query<{ hits: number }>('SELECT hits FROM password_reset_limits WHERE bucket=:bucket FOR UPDATE', { bucket }, transaction);
      return row.hits <= maximum;
    });
  }
  async request(input: unknown, ip: string) {
    if (!this.configured()) throw new ServiceUnavailableException('La recuperación no está disponible por el momento. Intentá más tarde.');
    const body = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const slug = typeof body.commerceSlug === 'string' ? body.commerceSlug.trim().toLowerCase() : '';
    const audience = body.audience;
    const response = { message: GENERIC };
    if (!await this.allowed('request-global', 100) || !await this.allowed(`request-ip:${ip}`, 20)) return response;
    if (email.length > 190 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        !/^[a-z0-9][a-z0-9-]{0,119}$/.test(slug) || (audience !== 'customer' && audience !== 'admin')) return response;
    if (!await this.allowed(`email:${email}`, 3)) return response;
    // No account lookup before responding: existing and unknown accounts take the same path.
    await this.execute(`INSERT INTO password_reset_requests(id,email,slug,audience,available_at,expires_at)
      VALUES (:id,:email,:slug,:audience,NOW(3),DATE_ADD(NOW(3),INTERVAL 10 MINUTE))`,
    { id: randomUUID(), email, slug, audience });
    setImmediate(() => { void this.drain(); });
    return response;
  }
  async drain() {
    if (this.running || !this.configured()) return;
    this.running = true;
    try {
      await this.execute('DELETE FROM password_reset_limits WHERE expires_at < NOW(3)');
      await this.execute('DELETE FROM password_reset_tokens WHERE expires_at < NOW(3)');
      await this.execute('DELETE FROM password_reset_requests WHERE expires_at < NOW(3) OR attempts >= 3');
      for (let i = 0; i < 5; i++) {
        const job = await this.db.sequelize.transaction(async transaction => {
          const [row] = await this.query<Job>(`SELECT * FROM password_reset_requests WHERE available_at<=NOW(3)
            AND expires_at>NOW(3) AND attempts<3 ORDER BY available_at LIMIT 1 FOR UPDATE SKIP LOCKED`, {}, transaction);
          if (!row) return null;
          await this.execute('UPDATE password_reset_requests SET attempts=attempts+1, available_at=DATE_ADD(NOW(3),INTERVAL 1 MINUTE) WHERE id=:id', { id: row.id }, transaction);
          return row;
        });
        if (!job) break;
        try {
          await this.issue(job);
          await this.execute('DELETE FROM password_reset_requests WHERE id=:id', { id: job.id });
        } catch { this.logger.warn('Password recovery delivery failed; bounded retry pending.'); }
      }
    } catch { this.logger.error('Password recovery queue unavailable.'); }
    finally { this.running = false; }
  }
  private async send(to: string, subject: string, text: string) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.ORDER_EMAIL_FROM, to: [to], subject, text }),
    });
    const data = await response.json().catch(() => null) as { id?: string } | null;
    if (!response.ok || !data?.id) throw new Error('Recovery email unavailable');
  }
  async issue(scope: Scope) {
    const commerce = await Commerce.findOne({ where: { slug: scope.slug, active: true } });
    if (!commerce) return;
    const role = scope.audience === 'customer' ? 'customer' : { [Op.in]: ['admin', 'superadmin', 'operator'] };
    const token = randomBytes(32).toString('hex');
    const issued = await this.db.sequelize.transaction(async transaction => {
      const user = await User.findOne({ where: { email: scope.email, commerceId: commerce.id, active: true, role }, transaction, lock: transaction.LOCK.UPDATE });
      if (!user) return false;
      await this.execute('DELETE FROM password_reset_tokens WHERE user_id=:id', { id: user.id }, transaction);
      await this.execute(`INSERT INTO password_reset_tokens(token_hash,user_id,commerce_id,audience,password_fingerprint,expires_at)
        VALUES (:hash,:user,:commerce,:audience,:fingerprint,DATE_ADD(NOW(3),INTERVAL 20 MINUTE))`,
      { hash: digest(token), user: user.id, commerce: commerce.id, audience: scope.audience, fingerprint: digest(user.passwordHash) }, transaction);
      return true;
    });
    if (!issued) return;
    // Fragment stays out of HTTP access logs and referrer headers. Never use request Host.
    const link = `${this.origin()}/recuperar#token=${token}&comercio=${encodeURIComponent(scope.slug)}&tipo=${scope.audience}`;
    await this.send(scope.email, 'Recuperá tu contraseña',
      `Recibimos una solicitud para tu cuenta en ${commerce.name}.\n\nAbrí este enlace para elegir una contraseña nueva:\n${link}\n\nVence en 20 minutos y solo se puede usar una vez. Si no lo pediste, ignorá este mensaje. Tu contraseña no cambió.`);
  }
  async reset(input: unknown, ip: string) {
    const body = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    if (!await this.allowed('reset-global', 100) || !await this.allowed(`reset-ip:${ip}`, 20)) throw new BadRequestException('Demasiados intentos. Esperá 15 minutos.');
    if (typeof body.token !== 'string' || !/^[a-f0-9]{64}$/.test(body.token) ||
        typeof body.commerceSlug !== 'string' || body.commerceSlug.length > 120 ||
        (body.audience !== 'customer' && body.audience !== 'admin')) throw new BadRequestException(INVALID);
    const password = body.password;
    if (typeof password !== 'string' || [...password].length < 15 || Buffer.byteLength(password, 'utf8') > 72 || body.confirmPassword !== password)
      throw new BadRequestException('Usá al menos 15 caracteres, un máximo de 72 bytes, y repetí la misma contraseña.');
    const hash = digest(body.token);
    const [candidate] = await this.query<Reset>('SELECT * FROM password_reset_tokens WHERE token_hash=:hash AND expires_at>NOW(3)', { hash });
    if (!candidate) throw new BadRequestException(INVALID);
    const commerce = await Commerce.findOne({ where: { id: candidate.commerce_id, slug: body.commerceSlug, active: true } });
    if (!commerce || candidate.audience !== body.audience) throw new BadRequestException(INVALID);
    const passwordHash = await bcrypt.hash(password, 12);
    const email = await this.db.sequelize.transaction(async transaction => {
      const user = await User.findByPk(candidate.user_id, { transaction, lock: transaction.LOCK.UPDATE });
      const [token] = await this.query<Reset>('SELECT * FROM password_reset_tokens WHERE token_hash=:hash AND expires_at>NOW(3) FOR UPDATE', { hash }, transaction);
      if (!user || !token || !user.active || user.commerceId !== commerce.id || token.commerce_id !== commerce.id ||
          token.audience !== body.audience || (body.audience === 'customer' ? user.role !== 'customer' : !['admin','superadmin','operator'].includes(user.role)) ||
          token.password_fingerprint !== digest(user.passwordHash)) throw new BadRequestException(INVALID);
      await user.update({ passwordHash }, { transaction });
      await Session.update({ revokedAt: new Date() }, { where: { userId: user.id, revokedAt: null }, transaction });
      await this.execute('DELETE FROM password_reset_tokens WHERE user_id=:id', { id: user.id }, transaction);
      await this.execute('DELETE FROM password_reset_requests WHERE email=:email AND slug=:slug', { email: user.email, slug: commerce.slug }, transaction);
      return user.email;
    });
    void this.send(email, 'Tu contraseña fue actualizada', 'La contraseña de tu cuenta fue actualizada y cerramos las sesiones anteriores. Si no hiciste este cambio, contactá al comercio y solicitá una nueva recuperación.').catch(() => this.logger.warn('Password change notification failed.'));
    return { message: 'Contraseña actualizada. Iniciá sesión con tu nueva contraseña.' };
  }
}
