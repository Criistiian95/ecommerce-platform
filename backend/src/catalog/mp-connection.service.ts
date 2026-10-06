import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { Op } from 'sequelize';
import { MpConnection, MpOAuthState } from '../database/models/mp-connection.model';

type Credentials = { access_token: string; refresh_token: string };
@Injectable()
export class MpConnectionService {
  private key() {
    const key = Buffer.from(process.env.MP_TOKEN_ENCRYPTION_KEY ?? '', 'base64');
    if (key.length !== 32) throw new ServiceUnavailableException('La conexión de cobros aún no está configurada');
    return key;
  }
  encrypt(value: string, commerceId: string) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    cipher.setAAD(Buffer.from(commerceId));
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
  }
  decrypt(value: string, commerceId: string) {
    const data = Buffer.from(value, 'base64');
    const cipher = createDecipheriv('aes-256-gcm', this.key(), data.subarray(0, 12));
    cipher.setAAD(Buffer.from(commerceId)); cipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString('utf8');
  }
  private config() {
    this.key();
    const client_id = process.env.MP_CLIENT_ID, client_secret = process.env.MP_CLIENT_SECRET;
    const redirect_uri = process.env.MP_OAUTH_REDIRECT_URI;
    if (!client_id || !client_secret || !redirect_uri?.startsWith('https://')) throw new ServiceUnavailableException('La conexión de cobros aún no está configurada');
    return { client_id, client_secret, redirect_uri };
  }
  async status(commerceId: string) {
    let configured = true;
    try { this.config(); } catch { configured = false; }
    const row = await MpConnection.findByPk(commerceId);
    return { configured, connected: !!row, collectorId: row?.collectorId ?? null, expiresAt: row?.expiresAt ?? null };
  }
  async start(commerceId: string, userId: string) {
    const config = this.config();
    const state = randomBytes(32).toString('hex'), verifier = randomBytes(32).toString('base64url');
    await MpOAuthState.destroy({ where: { expiresAt: { [Op.lt]: new Date() } } });
    await MpOAuthState.create({ id: createHash('sha256').update(state).digest('hex'), commerceId, userId,
      verifier: this.encrypt(verifier, commerceId), expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
    const query = new URLSearchParams({ client_id: config.client_id, response_type: 'code', platform_id: 'mp',
      state, redirect_uri: config.redirect_uri, code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(verifier).digest('base64url') });
    return { url: `https://auth.mercadopago.com/authorization?${query}` };
  }
  private async exchange(fields: Record<string, string>) {
    const response = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...this.config(), ...fields }),
    });
    const data = await response.json().catch(() => null) as any;
    if (!response.ok || typeof data?.access_token !== 'string' || typeof data?.refresh_token !== 'string' ||
        !/^\d+$/.test(String(data?.user_id)) || !Number.isFinite(data?.expires_in) || data.expires_in <= 0) {
      // Never include provider responses/tokens in logs or HTTP errors.
      throw new ServiceUnavailableException('No se pudo autorizar Mercado Pago. Reintentá la conexión.');
    }
    return data as Credentials & { user_id: number; expires_in: number };
  }
  async finish(commerceId: string, userId: string, state: string, code: string) {
    if (typeof state !== 'string' || !/^[a-f0-9]{64}$/.test(state) || typeof code !== 'string' || !code || code.length > 2048) throw new BadRequestException('Autorización inválida');
    // Consume state before the external request: a failed exchange requires a new authorization.
    const verifier = await MpOAuthState.sequelize!.transaction(async transaction => {
      const row = await MpOAuthState.findByPk(createHash('sha256').update(state).digest('hex'), { transaction, lock: transaction.LOCK.UPDATE });
      if (!row || row.commerceId !== commerceId || row.userId !== userId || row.expiresAt <= new Date()) throw new BadRequestException('La autorización venció o pertenece a otra sesión');
      const verifier = this.decrypt(row.verifier, commerceId);
      await row.destroy({ transaction });
      return verifier;
    });
    const data = await this.exchange({ grant_type: 'authorization_code', code, code_verifier: verifier });
    await MpConnection.sequelize!.transaction(async transaction => {
      const current = await MpConnection.findByPk(commerceId, { transaction, lock: transaction.LOCK.UPDATE });
      // Reauthorization can renew the same seller, never silently change historical payment ownership.
      if (current && current.collectorId !== String(data.user_id)) throw new ConflictException('Este comercio ya está vinculado a otra cuenta. Reconectá la cuenta original.');
      const other = await MpConnection.findOne({ where: { collectorId: String(data.user_id) }, transaction });
      if (other && other.commerceId !== commerceId) throw new ConflictException('Esta cuenta ya está vinculada a otro comercio');
      const values = { collectorId: String(data.user_id), credentials: this.encrypt(JSON.stringify({ access_token: data.access_token, refresh_token: data.refresh_token }), commerceId), expiresAt: new Date(Date.now() + data.expires_in * 1000) };
      if (current) await current.update(values, { transaction });
      else await MpConnection.create({ commerceId, ...values }, { transaction });
    });
    return this.status(commerceId);
  }
  async credentials(commerceId: string) {
    return MpConnection.sequelize!.transaction(async transaction => {
      const row = await MpConnection.findByPk(commerceId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!row) throw new ServiceUnavailableException('El comercio todavía no conectó Mercado Pago');
      let credentials = JSON.parse(this.decrypt(row.credentials, commerceId)) as Credentials;
      if (row.expiresAt.getTime() < Date.now() + 5 * 60 * 1000) {
        const data = await this.exchange({ grant_type: 'refresh_token', refresh_token: credentials.refresh_token });
        if (String(data.user_id) !== row.collectorId) throw new ServiceUnavailableException('Cuenta de cobro inválida');
        credentials = { access_token: data.access_token, refresh_token: data.refresh_token };
        await row.update({ credentials: this.encrypt(JSON.stringify(credentials), commerceId), expiresAt: new Date(Date.now() + data.expires_in * 1000) }, { transaction });
      }
      return { token: credentials.access_token, collectorId: row.collectorId };
    });
  }
}
