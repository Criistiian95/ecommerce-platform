import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Op } from 'sequelize';
import { DatabaseService } from '../database/database.service';
import { RegistrationEmailDelivery } from '../database/models/registration-email-delivery.model';
import { OrderEmailService } from '../catalog/order-email.service';
import { RegistrationEmailPayload, RegistrationEmailService, registrationAlertAddress } from './registration-email.service';

@Injectable()
export class RegistrationEmailWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private stopped = false;
  constructor(private readonly db: DatabaseService, private readonly emails: RegistrationEmailService, private readonly transport: OrderEmailService) {}

  onApplicationBootstrap() {
    if (!process.env.RESEND_API_KEY || !process.env.ORDER_EMAIL_FROM) console.warn('Registration emails are pending: email sender is not configured.');
    else console.info('Registration email sender is configured.');
    if (!registrationAlertAddress(process.env.PLATFORM_REGISTRATION_ALERT_EMAIL)) console.warn('Registration alerts are pending: platform recipient is not configured.');
    else console.info('Registration alert recipient is configured.');
    this.timer = setInterval(() => { void this.run(); }, 30_000);
    this.timer.unref();
    void this.run();
  }
  onModuleDestroy() { this.stopped = true; if (this.timer) clearInterval(this.timer); }

  async claim(platformAddress: string | null) {
    return this.db.sequelize.transaction(async transaction => {
      const now = new Date();
      const delivery = await RegistrationEmailDelivery.findOne({
        where: {
          audience: platformAddress ? { [Op.in]: ['welcome', 'platform'] } : 'welcome',
          [Op.or]: [
            { status: 'pending', nextAttemptAt: { [Op.lte]: now } },
            { status: 'sending', leaseUntil: { [Op.lte]: now } },
          ],
        },
        order: [['nextAttemptAt', 'ASC'], ['id', 'ASC']], transaction,
        lock: transaction.LOCK.UPDATE, skipLocked: true,
      });
      if (!delivery) return null;
      if (delivery.attempts >= 10 || (delivery.firstAttemptAt && now.getTime() - delivery.firstAttemptAt.getTime() >= 20 * 60 * 60_000)) {
        await delivery.update({ status: 'failed', lastError: 'manual_review_required', leaseUntil: null, leaseToken: null }, { transaction });
        return { skipped: true as const };
      }
      const payload = delivery.payload as RegistrationEmailPayload;
      const message = delivery.message ?? JSON.stringify(delivery.audience === 'welcome'
        ? this.emails.buildWelcomeMessage(payload, process.env.ORDER_EMAIL_FROM!)
        : this.emails.buildPlatformMessage(payload, process.env.ORDER_EMAIL_FROM!, platformAddress!));
      await delivery.update({ status: 'sending', attempts: delivery.attempts + 1,
        firstAttemptAt: delivery.firstAttemptAt ?? now, message,
        leaseUntil: new Date(now.getTime() + 60_000), leaseToken: randomUUID() }, { transaction });
      return delivery;
    });
  }

  async run() {
    if (this.running || this.stopped || !process.env.RESEND_API_KEY || !process.env.ORDER_EMAIL_FROM) return;
    this.running = true;
    try {
      const platformAddress = registrationAlertAddress(process.env.PLATFORM_REGISTRATION_ALERT_EMAIL);
      for (let i = 0; i < 20 && !this.stopped; i++) {
        const delivery = await this.claim(platformAddress);
        if (!delivery) break;
        if ('skipped' in delivery) continue;
        const result = await this.transport.sendMessage(delivery.message!, `registration/${delivery.id}`);
        const retryable = result.retryable || ['provider_http_401', 'provider_http_403'].includes(result.error ?? '');
        const delay = Math.min(60 * 60_000, 60_000 * 2 ** (delivery.attempts - 1));
        await RegistrationEmailDelivery.update({
          status: result.id ? 'sent' : retryable && delivery.attempts < 10 ? 'pending' : 'failed',
          providerMessageId: result.id ?? null, sentAt: result.id ? new Date() : null,
          lastError: result.id ? null : result.error, nextAttemptAt: new Date(Date.now() + delay),
          leaseUntil: null, leaseToken: null,
          ...(result.id ? { payload: {}, message: null } : {}),
        }, { where: { id: delivery.id, status: 'sending', leaseToken: delivery.leaseToken } });
      }
    } catch { console.warn('Registration email worker failed; pending deliveries will be retried.'); }
    finally { this.running = false; }
  }
}
