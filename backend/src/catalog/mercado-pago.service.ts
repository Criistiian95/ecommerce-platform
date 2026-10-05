import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { Commerce } from '../database/models/commerce.model';
import { Order } from '../database/models/order.model';
import { OrderItem } from '../database/models/order-item.model';
import { Product } from '../database/models/product.model';
import { StockMovement } from '../database/models/stock-movement.model';
import { OrderEmailService } from './order-email.service';

type MpPreferenceResponse = {
  id: string;
  init_point?: string;
  sandbox_init_point?: string;
  external_reference?: string;
};

type MpPayment = {
  id: number | string;
  status: string;
  status_detail?: string;
  transaction_amount?: number;
  currency_id?: string;
  external_reference?: string | null;
};

type MpPaymentSearch = {
  results?: MpPayment[];
  paging?: { total: number };
};

@Injectable()
export class MercadoPagoService {
  constructor(private readonly orderEmail: OrderEmailService) {}

  private accessToken() {
    const token = process.env.MP_ACCESS_TOKEN;
    if (!token) throw new Error('MP_ACCESS_TOKEN is not configured');
    return token;
  }

  async createCheckout(
    order: Order,
    items: Array<{ title: string; quantity: number; unitPrice: number }>,
  ) {
    const frontendUrl = (process.env.FRONTEND_URL ?? '').replace(/\/$/, '');
    if (!frontendUrl) throw new Error('FRONTEND_URL is not configured');

    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${this.accessToken()}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        items: items.map(item => ({
          title: item.title,
          quantity: item.quantity,
          unit_price: Number(item.unitPrice.toFixed(2)),
          currency_id: 'ARS',
        })),
        payer: {
          email: order.customerEmail,
        },
        external_reference: order.id,
        statement_descriptor: 'ECOMMERCE',
        back_urls: {
          success: `${frontendUrl}/pago/resultado?result=success&order=${order.id}`,
          failure: `${frontendUrl}/pago/resultado?result=failure&order=${order.id}`,
          pending: `${frontendUrl}/pago/resultado?result=pending&order=${order.id}`,
        },
        auto_return: 'approved',
        expires: true,
        expiration_date_to: (order.reservationExpiresAt ?? new Date(Date.now() + 30 * 60 * 1000)).toISOString(),
      }),
    });

    const data = await response.json().catch(() => null) as MpPreferenceResponse | null;

    const token = this.accessToken();
    const checkoutUrl = token.startsWith('TEST-')
      ? data?.sandbox_init_point ?? data?.init_point
      : data?.init_point;

    if (!response.ok || !data?.id || !checkoutUrl) {
      throw new Error(
        `Mercado Pago preference creation failed (${response.status}): ${JSON.stringify(data)}`,
      );
    }

    await order.update({
      mpOrderId: data.id,
      mpCheckoutUrl: checkoutUrl,
    });

    return {
      mpOrderId: data.id,
      checkoutUrl,
    };
  }

  validateWebhookSignature(
    xSignature: string | undefined,
    xRequestId: string | undefined,
    dataId: string | undefined,
  ) {
    const secret = process.env.MP_WEBHOOK_SECRET;
    if (!secret || !xSignature || !xRequestId || !dataId) return false;

    const parts = Object.fromEntries(
      xSignature.split(',').map(part => {
        const [key, value] = part.trim().split('=');
        return [key, value];
      }),
    );

    const ts = parts.ts;
    const received = parts.v1;
    if (!ts || !received) return false;

    const manifest = `id:${dataId.toLowerCase()};request-id:${xRequestId};ts:${ts};`;
    const expected = createHmac('sha256', secret).update(manifest).digest('hex');

    try {
      return timingSafeEqual(
        Buffer.from(received, 'hex'),
        Buffer.from(expected, 'hex'),
      );
    } catch {
      return false;
    }
  }

  private async fetchPayment(paymentId: string) {
    const response = await fetch(
      `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
      {
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${this.accessToken()}`,
          Accept: 'application/json',
        },
      },
    );

    const data = await response.json().catch(() => null) as MpPayment | null;
    if (!response.ok || !data?.id) {
      throw new Error(
        `Mercado Pago payment lookup failed (${response.status}): ${JSON.stringify(data)}`,
      );
    }

    return data;
  }

  private async searchPayments(orderId: string) {
    const params = new URLSearchParams({
      external_reference: orderId,
      sort: 'date_created',
      criteria: 'desc',
      limit: '100',
    });

    const response = await fetch(
      `https://api.mercadopago.com/v1/payments/search?${params.toString()}`,
      {
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${this.accessToken()}`,
          Accept: 'application/json',
        },
      },
    );

    const data = await response.json().catch(() => null) as MpPaymentSearch | null;
    if (!response.ok) {
      throw new Error(
        `Mercado Pago payment search failed (${response.status}): ${JSON.stringify(data)}`,
      );
    }

    if (!Array.isArray(data?.results) || !Number.isFinite(data?.paging?.total) ||
        data!.paging!.total > data!.results!.length) {
      throw new Error('Incomplete payment search; reservation retained for safety');
    }
    return data.results;
  }

  async processPaymentNotification(paymentId: string) {
    const payment = await this.fetchPayment(paymentId);
    const orderId = payment.external_reference;
    if (!orderId) return;

    const order = await Order.findByPk(orderId);
    if (!order) {
      console.warn('Mercado Pago payment ignored: local order not found', orderId);
      return;
    }

    const amount = Number(payment.transaction_amount ?? 0);
    const expectedAmount = Number(order.total);

    if (payment.status === 'approved' && payment.currency_id === 'ARS' && Math.round(amount * 100) === Math.round(expectedAmount * 100)) {
      await this.confirmPaidOrder(order);
      return;
    }

    if (payment.status === 'refunded' && order.paymentStatus === 'paid') {
      await order.update({ paymentStatus: 'refunded' });
    }
  }

  private async confirmPaidOrder(order: Order) {
    if (order.paymentStatus === 'paid') return;

    const transaction = await Order.sequelize!.transaction();
    let committed = false;

    try {
      const lockedOrder = await Order.findByPk(order.id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!lockedOrder || lockedOrder.paymentStatus === 'paid') {
        await transaction.rollback();
        return;
      }

      // A delayed approval must never resurrect a released reservation.
      if (lockedOrder.status !== 'pending_payment' || lockedOrder.paymentStatus !== 'pending') {
        await lockedOrder.update({ paymentStatus: 'paid', paidAt: new Date(), paymentReviewRequired: true }, { transaction });
        await transaction.commit();
        committed = true;
        console.error('Paid order requires manual stock/payment review', lockedOrder.id);
        return;
      }

      await lockedOrder.update(
        {
          paymentStatus: 'paid',
          status: 'confirmed',
          paidAt: new Date(),
        },
        { transaction },
      );

      await StockMovement.update(
        {
          type: 'sale',
          reason: `Venta pedido ${lockedOrder.orderNumber}`,
        },
        {
          where: {
            commerceId: lockedOrder.commerceId,
            type: 'reservation',
            reason: `Reserva pedido ${lockedOrder.orderNumber}`,
          },
          transaction,
        },
      );

      await transaction.commit();
      committed = true;

      const commerce = await Commerce.findByPk(lockedOrder.commerceId, {
        attributes: ['name'],
      });
      const items = await OrderItem.findAll({
        where: { orderId: lockedOrder.id },
      });

      if (commerce) {
        void this.orderEmail.sendConfirmation({
          commerceName: commerce.name,
          orderNumber: lockedOrder.orderNumber,
          customerName: lockedOrder.customerName,
          customerEmail: lockedOrder.customerEmail,
          deliveryMethod: lockedOrder.deliveryMethod,
          address: lockedOrder.address,
          total: Number(lockedOrder.total),
          items: items.map(item => ({
            name: item.productName,
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice),
            lineTotal: Number(item.lineTotal),
          })),
        }).catch(error => {
          console.error('Paid order confirmation email failed', error);
        });
      }
    } catch (error) {
      if (!committed) await transaction.rollback();
      throw error;
    }
  }

  async releaseReservation(
    order: Order,
    paymentStatus: 'rejected' | 'cancelled',
  ) {
    if (order.paymentStatus !== 'pending' || order.status !== 'pending_payment') return;

    const transaction = await Order.sequelize!.transaction();
    let committed = false;

    try {
      const lockedOrder = await Order.findByPk(order.id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (
        !lockedOrder ||
        lockedOrder.paymentStatus !== 'pending' ||
        lockedOrder.status !== 'pending_payment'
      ) {
        await transaction.rollback();
        return;
      }

      const items = await OrderItem.findAll({
        where: { orderId: lockedOrder.id },
        order: [['productId', 'ASC']],
        transaction,
      });

      for (const item of items) {
        const product = await Product.findByPk(item.productId, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });

        if (!product) continue;

        const previousStock = product.currentStock;
        const newStock = previousStock + item.quantity;

        await product.update({ currentStock: newStock }, { transaction });

        await StockMovement.create(
          {
            commerceId: lockedOrder.commerceId,
            productId: product.id,
            userId: null,
            type: 'release',
            previousStock,
            quantityChange: item.quantity,
            newStock,
            reason: `Liberación pedido ${lockedOrder.orderNumber}`,
          },
          { transaction },
        );
      }

      await lockedOrder.update(
        {
          paymentStatus,
          status: 'cancelled',
        },
        { transaction },
      );

      await transaction.commit();
      committed = true;
    } catch (error) {
      if (!committed) await transaction.rollback();
      throw error;
    }
  }

  async reconcileExpiredReservation(order: Order) {
    if (order.paymentStatus !== 'pending' || order.status !== 'pending_payment') return;
    let expiresAt = order.reservationExpiresAt;
    if (!expiresAt) {
      if (!order.mpOrderId) return; // Legacy incomplete checkout: needs manual reconciliation.
      const response = await fetch(`https://api.mercadopago.com/checkout/preferences/${encodeURIComponent(order.mpOrderId)}`, {
        signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${this.accessToken()}` },
      });
      if (!response.ok) throw new Error('Cannot verify legacy preference expiration');
      const preference = await response.json() as { expires?: boolean; expiration_date_to?: string };
      if (!preference.expires || !preference.expiration_date_to) return;
      expiresAt = new Date(preference.expiration_date_to);
      if (!Number.isFinite(expiresAt.getTime())) return;
      await order.update({ reservationExpiresAt: expiresAt });
    }
    // Grace period for notifications/search propagation after checkout expiration.
    if (expiresAt.getTime() + 5 * 60 * 1000 > Date.now()) return;
    const payments = await this.searchPayments(order.id);
    const approved = payments.filter(payment => payment.status === 'approved');
    if (approved.length) {
      for (const payment of approved) await this.processPaymentNotification(String(payment.id));
      return; // Even an amount mismatch must be reviewed, never released automatically.
    }
    const terminal = new Set(['rejected', 'cancelled', 'refunded']);
    if (payments.some(payment => !terminal.has(payment.status))) return;
    await this.releaseReservation(order, 'cancelled');
  }

  async getPublicOrderStatus(slug: string, orderId: string) {
    const commerce = await Commerce.findOne({
      where: { slug, active: true },
      attributes: ['id'],
    });
    if (!commerce) return null;

    let order = await Order.findOne({
      where: { id: orderId, commerceId: commerce.id },
    });
    if (!order) return null;

    if (order.paymentStatus === 'pending') {
      try {
        const payments = await this.searchPayments(order.id);
        const approved = payments.find(
          payment =>
            payment.status === 'approved' && payment.currency_id === 'ARS' &&
            Math.round(Number(payment.transaction_amount ?? 0) * 100) === Math.round(Number(order!.total) * 100),
        );

        if (approved) {
          await this.processPaymentNotification(String(approved.id));
          order = (await Order.findByPk(order.id)) ?? order;
        }
      } catch (error) {
        console.error('Could not refresh Mercado Pago payment status', error);
      }
    }

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentReviewRequired: order.paymentReviewRequired,
      total: Number(order.total),
      deliveryMethod: order.deliveryMethod,
      checkoutUrl:
        order.paymentStatus === 'pending' && (!order.reservationExpiresAt || order.reservationExpiresAt > new Date()) ? order.mpCheckoutUrl : null,
    };
  }
}
