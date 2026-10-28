import { BadRequestException, HttpException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { QueryTypes } from 'sequelize';
import { DatabaseService } from '../database/database.service';
import { OrderEmailService } from '../catalog/order-email.service';
import { registrationAlertAddress } from '../auth/registration-email.service';

type CodeRow = { id: string; code_hash: string; attempts: number; expires_at: Date; used_at: Date | null };
const invalid = 'El código no es válido o venció. Solicitá uno nuevo.';

@Injectable()
export class PlatformOwnerService {
  constructor(private readonly db: DatabaseService, private readonly mail: OrderEmailService) {}

  private secret() {
    if (!process.env.JWT_SECRET) throw new ServiceUnavailableException('El acceso todavía no está configurado.');
    return process.env.JWT_SECRET;
  }
  private owner() {
    const email = registrationAlertAddress(process.env.PLATFORM_REGISTRATION_ALERT_EMAIL);
    if (!email) throw new ServiceUnavailableException('El acceso todavía no está configurado.');
    return email;
  }
  private digest(value: string) { return createHmac('sha256', this.secret()).update(value).digest('hex'); }

  async requestCode() {
    const email = this.owner();
    if (!process.env.RESEND_API_KEY || !process.env.ORDER_EMAIL_FROM) throw new ServiceUnavailableException('No se pudo enviar el código.');
    const window = Math.floor(Date.now() / 900_000);
    const bucket = this.digest(`platform-owner-request:${window}`);
    const allowed = await this.db.sequelize.transaction(async transaction => {
      await this.db.sequelize.query(`INSERT INTO password_reset_limits(bucket,hits,expires_at) VALUES (:bucket,1,:expiry)
        ON DUPLICATE KEY UPDATE hits=LEAST(hits+1,1000000)`,
      { replacements: { bucket, expiry: new Date((window + 2) * 900_000) }, transaction });
      const [row] = await this.db.sequelize.query<{ hits: number }>('SELECT hits FROM password_reset_limits WHERE bucket=:bucket FOR UPDATE',
        { replacements: { bucket }, type: QueryTypes.SELECT, transaction });
      return row.hits <= 3;
    });
    if (!allowed) throw new HttpException('Pediste varios códigos. Esperá unos minutos e intentá de nuevo.', 429);
    const id = randomUUID();
    const code = String(randomInt(0, 100_000_000)).padStart(8, '0');
    const now = new Date();
    await this.db.sequelize.query(`INSERT INTO platform_owner_codes(id,code_hash,attempts,expires_at,created_at)
      VALUES (:id,:hash,0,:expires,:now)`, { replacements: { id, hash: this.digest(`code:${id}:${code}`), expires: new Date(now.getTime() + 10 * 60_000), now } });
    const message = { from: process.env.ORDER_EMAIL_FROM, to: [email], subject: 'Tu código de acceso a Diseños L&S',
      text: `Tu código para ver las estadísticas de Diseños L&S es: ${code}\n\nVence en 10 minutos y se puede usar una sola vez. Si no lo solicitaste, ignorá este mensaje.` };
    const result = await this.mail.sendMessage(JSON.stringify(message), `platform-owner/${id}`);
    if (!result.id) throw new ServiceUnavailableException('No se pudo enviar el código. Intentá más tarde.');
    return { ok: true };
  }

  async verifyCode(value: unknown) {
    const owner = this.owner();
    if (typeof value !== 'string' || !/^\d{8}$/.test(value)) throw new BadRequestException(invalid);
    const valid = await this.db.sequelize.transaction(async transaction => {
      const [row] = await this.db.sequelize.query<CodeRow>(`SELECT id,code_hash,attempts,expires_at,used_at FROM platform_owner_codes
        ORDER BY sequence DESC LIMIT 1 FOR UPDATE`, { type: QueryTypes.SELECT, transaction });
      if (!row || row.used_at || row.attempts >= 5 || new Date(row.expires_at).getTime() <= Date.now()) return false;
      const expected = Buffer.from(row.code_hash, 'hex');
      const actual = Buffer.from(this.digest(`code:${row.id}:${value}`), 'hex');
      const matches = expected.length === actual.length && timingSafeEqual(expected, actual);
      await this.db.sequelize.query(`UPDATE platform_owner_codes SET attempts=attempts+1, used_at=:used WHERE id=:id`,
        { replacements: { id: row.id, used: matches ? new Date() : null }, transaction });
      return matches;
    });
    if (!valid) throw new BadRequestException(invalid);
    return { token: jwt.sign({ scope: 'platform-statistics', owner: this.digest(`owner:${owner}`) }, this.secret(),
      { subject: 'owner', audience: 'disenolys-platform', issuer: 'disenolys', expiresIn: '2h' }) };
  }

  authorize(header: string | undefined) {
    try {
      if (!header?.startsWith('Bearer ')) throw new Error('Missing token');
      const token = jwt.verify(header.slice(7), this.secret(), { audience: 'disenolys-platform', issuer: 'disenolys' });
      if (typeof token === 'string' || token.sub !== 'owner' || token.scope !== 'platform-statistics' ||
          token.owner !== this.digest(`owner:${this.owner()}`)) throw new Error('Invalid scope');
      return true;
    } catch { throw new UnauthorizedException('Ingresá nuevamente para ver las estadísticas.'); }
  }
}
