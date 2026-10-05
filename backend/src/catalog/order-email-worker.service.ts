import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Op } from 'sequelize';
import { Order } from '../database/models/order.model';
import { OrderEmailDelivery } from '../database/models/order-email-delivery.model';
import { OrderEmailService, ConfirmationInput } from './order-email.service';

@Injectable()
export class OrderEmailWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private stopped = false;
  constructor(private readonly emails: OrderEmailService) {}
  onApplicationBootstrap() {
    this.timer = setInterval(() => { void this.run(); }, 30_000);
    this.timer.unref();
    void this.run();
  }
  onModuleDestroy() { this.stopped = true; if (this.timer) clearInterval(this.timer); }

  async claim() {
    return OrderEmailDelivery.sequelize!.transaction(async transaction => {
      const now = new Date();
      const delivery = await OrderEmailDelivery.findOne({
        where: { [Op.or]: [
          { status: 'pending', nextAttemptAt: { [Op.lte]: now } },
          { status: 'sending', leaseUntil: { [Op.lte]: now } },
        ] }, order: [['nextAttemptAt', 'ASC'], ['id', 'ASC']],
        transaction, lock: transaction.LOCK.UPDATE, skipLocked: true,
      });
      if (!delivery) return null;
      const order = await Order.findByPk(delivery.orderId, { transaction });
      if (!order || order.paymentStatus !== 'paid' || order.paymentReviewRequired || order.status === 'cancelled') {
        await delivery.update({ status: 'failed', lastError: 'order_not_confirmed', leaseUntil: null, leaseToken: null }, { transaction });
        return { skipped: true as const };
      }
      // Never retry outside Resend's 24-hour deduplication window.
      if (delivery.attempts >= 10 || (delivery.firstAttemptAt && now.getTime() - delivery.firstAttemptAt.getTime() >= 20 * 60 * 60_000)) {
        await delivery.update({ status: 'failed', lastError: 'manual_review_required', leaseUntil: null, leaseToken: null }, { transaction });
        return { skipped: true as const };
      }
      await delivery.update({ status: 'sending', attempts: delivery.attempts + 1,
        firstAttemptAt: delivery.firstAttemptAt ?? now,
        message: delivery.message ?? JSON.stringify(this.emails.buildMessage(delivery.payload as ConfirmationInput, process.env.ORDER_EMAIL_FROM!)),
        leaseUntil: new Date(now.getTime() + 60_000), leaseToken: randomUUID() }, { transaction });
      return delivery;
    });
  }

  async run() {
    if (this.running || this.stopped || !process.env.RESEND_API_KEY || !process.env.ORDER_EMAIL_FROM) return;
    this.running = true;
    try {
      for (let i = 0; i < 20 && !this.stopped; i++) {
        const delivery = await this.claim();
        if (!delivery) break;
        if ('skipped' in delivery) continue;
        const result = await this.emails.sendMessage(delivery.message!, `order-confirmation/${delivery.id}`);
        const exhausted = delivery.attempts >= 10;
        const delay = Math.min(60 * 60_000, 60_000 * 2 ** (delivery.attempts - 1));
        await OrderEmailDelivery.update({
          status: result.id ? 'sent' : result.retryable && !exhausted ? 'pending' : 'failed',
          providerMessageId: result.id ?? null, sentAt: result.id ? new Date() : null,
          lastError: result.id ? null : result.error,
          nextAttemptAt: new Date(Date.now() + delay), leaseUntil: null, leaseToken: null,
        }, { where: { id: delivery.id, status: 'sending', leaseToken: delivery.leaseToken } });
      }
    } catch (error) { console.error('Email worker failed; persisted delivery will be retried', error); }
    finally { this.running = false; }
  }
}
