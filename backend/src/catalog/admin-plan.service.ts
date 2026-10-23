import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Commerce } from '../database/models/commerce.model';
import { BillingSubscription } from '../database/models/billing-subscription.model';
import { BillingPayment } from '../database/models/billing-payment.model';
import { BILLING_MONTHLY_ARS } from '../billing/billing-rules';

const PAGE_SIZE = 10;

/** Read the signed-in merchant's plan. Viewing this page never creates a charge. */
@Injectable()
export class AdminPlanService {
  async getPlan(commerceId: string | null, page = 1) {
    if (!commerceId) throw new BadRequestException('La sesión no tiene un comercio asociado');
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000) {
      throw new BadRequestException('Página inválida');
    }
    const commerce = await Commerce.findByPk(commerceId, { attributes: ['id', 'name', 'slug', 'active'] });
    if (!commerce) throw new NotFoundException('Comercio no encontrado');
    const [subscription, history, lastPayment] = await Promise.all([
      BillingSubscription.findByPk(commerceId),
      BillingPayment.findAndCountAll({
        where: { commerceId }, attributes: ['id', 'mpPaymentId', 'approvedAt'],
        order: [['approvedAt', 'DESC'], ['id', 'DESC']], limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE,
      }),
      BillingPayment.findOne({
        where: { commerceId }, attributes: ['id', 'mpPaymentId', 'approvedAt'],
        order: [['approvedAt', 'DESC'], ['id', 'DESC']],
      }),
    ]);
    const billingEnabled = process.env.BILLING_ENABLED === 'true';
    const serialize = (payment: BillingPayment) => ({
      id: payment.id, paymentReference: payment.mpPaymentId,
      approvedAt: payment.approvedAt.toISOString(), status: 'approved' as const,
    });
    // A checkout is only a continuation of an unpaid, existing subscription.
    // Active subscriptions must never be offered a second subscription here.
    let checkoutUrl: string | null = null;
    if (billingEnabled && subscription?.status === 'pending' && !subscription.paidThrough && !lastPayment && subscription.checkoutUrl) {
      try {
        const url = new URL(subscription.checkoutUrl);
        if (url.protocol === 'https:' && !url.username && !url.password &&
            (url.hostname === 'mercadopago.com.ar' || url.hostname.endsWith('.mercadopago.com.ar'))) {
          checkoutUrl = url.toString();
        }
      } catch { /* An invalid stored link is not exposed as a payment action. */ }
    }
    return {
      commerce: { id: commerce.id, name: commerce.name, slug: commerce.slug, active: commerce.active },
      billingEnabled,
      subscription: subscription ? {
        status: subscription.status, amountArs: Number(subscription.amountArs), currency: 'ARS',
        interval: 'month', paidThrough: subscription.paidThrough?.toISOString() ?? null,
        startedAt: subscription.startedAt?.toISOString() ?? null, checkoutUrl,
      } : null,
      currentOffer: { amountArs: BILLING_MONTHLY_ARS, currency: 'ARS', interval: 'month' },
      lastPayment: lastPayment ? serialize(lastPayment) : null,
      payments: history.rows.map(serialize),
      pagination: { page, pageSize: PAGE_SIZE, total: history.count, hasMore: page * PAGE_SIZE < history.count },
      checkedAt: new Date().toISOString(),
    };
  }
}
