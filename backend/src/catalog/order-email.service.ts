import { Injectable } from '@nestjs/common';

type ConfirmationLine = {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

type ConfirmationInput = {
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

  async sendConfirmation(input: ConfirmationInput) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.ORDER_EMAIL_FROM;

    if (!apiKey || !from) {
      console.warn('Order confirmation email skipped: RESEND_API_KEY or ORDER_EMAIL_FROM missing');
      return false;
    }

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

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [input.customerEmail],
        subject: `Pago confirmado - Pedido ${input.orderNumber}`,
        html,
        text,
        tags: [
          { name: 'category', value: 'order_confirmation' },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('Order confirmation email failed', response.status, detail);
      return false;
    }

    return true;
  }
}
