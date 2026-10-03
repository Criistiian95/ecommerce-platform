'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useCart } from '../../cart-context';
import { API_URL } from '../../storefront-types';
import { COMMERCE_SLUG } from '../../storefront-config';
import '../../tienda/store.module.css';

type PaymentStatus = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: 'pending' | 'paid' | 'rejected' | 'cancelled' | 'refunded';
  total: number;
  deliveryMethod: 'pickup' | 'shipping';
  checkoutUrl?: string | null;
};

export default function PaymentResultPage() {
  const { clearCart } = useCart();
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [message, setMessage] = useState('Verificando el pago...');
  const [orderId, setOrderId] = useState('');

  async function loadStatus(id: string) {
    try {
      const response = await fetch(
        `${API_URL}/catalog/store/${COMMERCE_SLUG}/orders/${id}/status`,
        { cache: 'no-store' },
      );

      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        setMessage('No pudimos consultar el estado del pedido.');
        return null;
      }

      setStatus(data);

      if (data.paymentStatus === 'paid') {
        clearCart();
        localStorage.removeItem('last_pending_order');
        setMessage('Pago aprobado.');
      } else if (data.paymentStatus === 'pending') {
        setMessage('El pago todavía está pendiente de confirmación.');
      } else if (data.paymentStatus === 'refunded') {
        setMessage('El pago fue reembolsado.');
      } else {
        setMessage('El pago no quedó confirmado.');
      }

      return data as PaymentStatus;
    } catch {
      setMessage('No pudimos consultar el estado del pago.');
      return null;
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('order') || localStorage.getItem('last_pending_order') || '';
    setOrderId(id);

    if (!id) {
      setMessage('No encontramos el pedido asociado al pago.');
      return;
    }

    let stopped = false;
    let attempts = 0;

    const check = async () => {
      const data = await loadStatus(id);
      attempts += 1;

      if (
        !stopped &&
        data?.paymentStatus === 'pending' &&
        attempts < 6
      ) {
        window.setTimeout(check, 2500);
      }
    };

    void check();

    return () => {
      stopped = true;
    };
  }, []);

  const paid = status?.paymentStatus === 'paid';
  const pending = status?.paymentStatus === 'pending';

  return (
    <main className="store-shell">
      <section className="payment-result-card">
        <div className={paid ? 'payment-result-icon success' : pending ? 'payment-result-icon pending' : 'payment-result-icon'}>
          {paid ? '✓' : pending ? '…' : '!'}
        </div>

        <h1>{paid ? 'Pago confirmado' : pending ? 'Estamos verificando tu pago' : 'Estado del pago'}</h1>
        <p className="checkout-muted">{message}</p>

        {status && (
          <>
            <div className="order-number">{status.orderNumber}</div>
            <div className="checkout-success-total">
              Total: <strong>$ {status.total.toLocaleString('es-AR')}</strong>
            </div>
          </>
        )}

        <div className="payment-result-actions">
          {pending && status?.checkoutUrl && (
            <a className="btn primary" href={status.checkoutUrl}>Volver a Mercado Pago</a>
          )}

          {orderId && (
            <button className="btn secondary" onClick={() => void loadStatus(orderId)}>
              Actualizar estado
            </button>
          )}

          <Link className="btn secondary" href="/tienda">Volver a la tienda</Link>
        </div>

        {paid && (
          <p className="checkout-muted payment-confirmation-note">
            Te enviamos la confirmación del pedido al email ingresado en el checkout.
          </p>
        )}
      </section>
    </main>
  );
}
