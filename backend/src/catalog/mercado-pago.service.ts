import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual, randomUUID } from 'crypto';
import { Commerce } from '../database/models/commerce.model';
import { Order } from '../database/models/order.model';
import { OrderItem } from '../database/models/order-item.model';
import { Product } from '../database/models/product.model';
import { StockMovement } from '../database/models/stock-movement.model';
import { OrderEmailService } from './order-email.service';

type MpOrderResponse = {
  id: string;
  status: string;
  status_detail?: string;
  checkout_url?: string;
  total_amount?: string;
  total_paid_amount?: string;
  external_reference?: string;
  transactions?: {
    payments?: Array<{
      id?: string;
      status?: string;
      status_detail?: string;
      paid_amount?: string;
    }>;
  };
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

    const total = Number(order.total).toFixed(2);
    const response = await fetch('https://api.mercadopago.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken()}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Idempotency-Key': randomUUID(),
      },
      body: JSON.stringify({
        type: 'online',
        processing_mode: 'manual',
        capture_mode: 'automatic_async',
        total_amount: total,
        external_reference: order.id,
        description: `Pedido ${order.orderNumber}`,
        expiration_time: 'PT30M',
        payer: {
          email: order.customerEmail,
        },
        items: items.map(item => ({
          title: item.title,
          quantity: item.quantity,
          unit_price: item.unitPrice.toFixed(2),
          total_amount: (item.unitPrice * item.quantity).toFixed(2),
          unit_measure: 'unit',
        })),
        config: {
          online: {
            success_url: `${frontendUrl}/pago/resultado?result=success&order=${order.id}`,
            failure_url: `${frontendUrl}/pago/resultado?result=failure&order=${order.id}`,
            pending_url: `${frontendUrl}/pago/resultado?result=pending&order=${order.id}`,
            auto_return: 'all',
          },
        },
      }),
    });

    const data = await response.json().catch(() => null) as MpOrderResponse | null;
    if (!response.ok || !data?.id || !data.checkout_url) {
      throw new Error(
        `Mercado Pago order creation failed (${response.status}): ${JSON.stringify(data)}`,
      );
    }

    await order.update({
      mpOrderId: data.id,
      mpCheckoutUrl: data.checkout_url,
    });

    return {
      mpOrderId: data.id,
      checkoutUrl: data.checkout_url,
    };
  }

  async fetchOrder(mpOrderId: string) {
    const response = await fetch(
      `https://api.mercadopago.com/v1/orders/${encodeURIComponent(mpOrderId)}`,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken()}`,
          Accept: 'application/json',
        },
      },
    );

    const data = await response.json().catch(() => null) as MpOrderResponse | null;
    if (!response.ok || !data?.id) {
      throw new Error(
        `Mercado Pago order lookup failed (${response.status}): ${JSON.stringify(data)}`,
      );
    }

    return data;
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

  async processOrderNotification(mpOrderId: string) {
    const mpOrder = await this.fetchOrder(mpOrderId);
    const order = await Order.findOne({
      where: { mpOrderId: mpOrder.id },
      include: [{ model: OrderItem, as: 'items' }],
    });

    if (!order) {
      console.warn('Mercado Pago webhook ignored: local order not found', mpOrder.id);
      return;
    }

    const paidAmount = Number(mpOrder.total_paid_amount ?? 0);
    const expectedAmount = Number(order.total);
    const isAccredited =
      mpOrder.status === 'processed' &&
      (mpOrder.status_detail === 'accredited' ||
        mpOrder.transactions?.payments?.some(
          payment =>
            payment.status === 'processed' &&
            payment.status_detail === 'accredited',
        ));

    if (isAccredited && paidAmount >= expectedAmount) {
      await this.confirmPaidOrder(order);
      return;
    }

    if (mpOrder.status === 'refunded') {
      await order.update({ paymentStatus: 'refunded' });
      return;
    }

    if (mpOrder.status === 'failed') {
      await this.releaseReservation(order, 'rejected');
      return;
    }

    if (mpOrder.status === 'canceled' || mpOrder.status === 'expired') {
      await this.releaseReservation(order, 'cancelled');
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
      const items = await OrderItem.findAll({ where: { orderId: lockedOrder.id } });

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

    if (order.paymentStatus === 'pending' && order.mpOrderId) {
      try {
        await this.processOrderNotification(order.mpOrderId);
        order = (await Order.findByPk(order.id)) ?? order;
      } catch (error) {
        console.error('Could not refresh Mercado Pago order status', error);
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
