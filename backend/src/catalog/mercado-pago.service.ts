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
  external_reference?: string | null;
};

type MpPaymentSearch = {
  results?: MpPayment[];
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
        expiration_date_to: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
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
    });

    const response = await fetch(
      `https://api.mercadopago.com/v1/payments/search?${params.toString()}`,
      {
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

    return data?.results ?? [];
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

    if (payment.status === 'approved' && amount >= expectedAmount) {
      await this.confirmPaidOrder(order);
      return;
    }

    if (payment.status === 'refunded') {
      await order.update({ paymentStatus: 'refunded' });
    }
  }

  private async confirmPaidOrder(order: Order) {
    if (order.paymentStatus === 'paid') return;

    const transaction = await Order.sequelize!.transaction();

    try {
      const lockedOrder = await Order.findByPk(order.id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!lockedOrder || lockedOrder.paymentStatus === 'paid') {
        await transaction.rollback();
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
      await transaction.rollback();
      throw error;
    }
  }

  async releaseReservation(
    order: Order,
    paymentStatus: 'rejected' | 'cancelled',
  ) {
    if (order.paymentStatus !== 'pending' || order.status !== 'pending_payment') return;

    const transaction = await Order.sequelize!.transaction();

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
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
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
            payment.status === 'approved' &&
            Number(payment.transaction_amount ?? 0) >= Number(order!.total),
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
      total: Number(order.total),
      deliveryMethod: order.deliveryMethod,
      checkoutUrl:
        order.paymentStatus === 'pending' ? order.mpCheckoutUrl : null,
    };
  }
}
