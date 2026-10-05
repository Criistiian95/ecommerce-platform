import { Injectable } from '@nestjs/common';
import type { Transaction } from 'sequelize';
import { OrderEmailDelivery } from '../database/models/order-email-delivery.model';
import { Order } from '../database/models/order.model';
import { OrderItem } from '../database/models/order-item.model';
import { Commerce } from '../database/models/commerce.model';

type ConfirmationLine = {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type ConfirmationInput = {
  commerceName: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  deliveryMethod: 'pickup' | 'shipping';
  address?: string | null;
  total: number;
  items: ConfirmationLine[];
};

@Injectable()
export class OrderEmailService {
  private escape(value: string) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  private money(value: number) {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 2,
    }).format(value);
  }

  async enqueue(order: Order, transaction: Transaction) {
    const commerce = await Commerce.findByPk(order.commerceId, { attributes: ['name'], transaction });
    if (!commerce) throw new Error('Commerce missing while scheduling order confirmation');
    const items = await OrderItem.findAll({ where: { orderId: order.id }, order: [['id', 'ASC']], transaction });
    const payload: ConfirmationInput = {
      commerceName: commerce.name, orderNumber: order.orderNumber,
      customerName: order.customerName, customerEmail: order.customerEmail,
      deliveryMethod: order.deliveryMethod, address: order.address, total: Number(order.total),
      items: items.map(item => ({ name: item.productName, quantity: item.quantity,
        unitPrice: Number(item.unitPrice), lineTotal: Number(item.lineTotal) })),
    };
    await OrderEmailDelivery.create({ orderId: order.id, payload, status: 'pending', nextAttemptAt: new Date() }, { transaction });
  }

  buildMessage(input: ConfirmationInput, from: string) {
    const itemsHtml = input.items
      .map(item => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #eee">${this.escape(item.name)}</td>
          <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:center">${item.quantity}</td>
          <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right">${this.money(item.lineTotal)}</td>
        </tr>
      `)
      .join('');

    const delivery =
      input.deliveryMethod === 'shipping'
        ? `Envío a ${this.escape(input.address ?? '')}`
        : 'Retiro por el comercio';

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#1f2937">
        <h1 style="margin-bottom:8px">Pago confirmado</h1>
        <p>Hola ${this.escape(input.customerName)}, tu pago fue acreditado y tu pedido en ${this.escape(input.commerceName)} quedó confirmado.</p>

        <div style="background:#f5f6f8;border-radius:12px;padding:16px;margin:20px 0">
          <strong>Número de pedido</strong>
          <div style="font-size:20px;margin-top:5px">${this.escape(input.orderNumber)}</div>
        </div>

        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr>
              <th style="text-align:left;padding-bottom:8px">Producto</th>
              <th style="text-align:center;padding-bottom:8px">Cant.</th>
              <th style="text-align:right;padding-bottom:8px">Subtotal</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>

        <div style="display:flex;justify-content:space-between;margin-top:18px;font-size:18px">
          <strong>Total</strong>
          <strong>${this.money(input.total)}</strong>
        </div>

        <p style="margin-top:22px"><strong>Entrega:</strong> ${delivery}</p>
        <p style="color:#6b7280">El pedido quedó confirmado. El comercio podrá actualizar su estado cuando comience a prepararlo.</p>
      </div>
    `;

    const text = [
      `Pago confirmado - ${input.commerceName}`,
      `Pedido: ${input.orderNumber}`,
      '',
      ...input.items.map(item =>
        `${item.quantity} x ${item.name} - ${this.money(item.lineTotal)}`
      ),
      '',
      `Total: ${this.money(input.total)}`,
      `Entrega: ${delivery.replace(/<[^>]*>/g, '')}`,
    ].join('\n');

    return { from, to: [input.customerEmail], subject: `Pago confirmado - Pedido ${input.orderNumber}`,
      html, text, tags: [{ name: 'category', value: 'order_confirmation' }] };
  }

  async sendMessage(message: Record<string, any>, key: string): Promise<{ id?: string; retryable: boolean; error?: string }> {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify(message),
      });
      const body = await response.json().catch(() => null) as { id?: string; name?: string } | null;
      if (response.ok && body?.id) return { id: body.id, retryable: false };
      const retryable = response.ok || response.status === 408 || response.status === 429 || response.status >= 500 ||
        (response.status === 409 && body?.name === 'concurrent_idempotent_requests');
      return { retryable, error: `provider_http_${response.status}` };
    } catch { return { retryable: true, error: 'provider_network_error' }; }
  }
}
