'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useCart } from '../cart-context';
import { API_URL } from '../storefront-types';
import { COMMERCE_SLUG } from '../storefront-config';
import '../tienda/store.module.css';

export default function CheckoutPage() {
  const { items, subtotal } = useCart();
  const [deliveryMethod, setDeliveryMethod] = useState<'pickup' | 'shipping'>('pickup');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!items.length) return;

    const form = new FormData(event.currentTarget);
    setSaving(true);
    setMessage('');

    try {
      const response = await fetch(
        `${API_URL}/catalog/store/${COMMERCE_SLUG}/checkout`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerName: form.get('customerName'),
            customerEmail: form.get('customerEmail'),
            customerPhone: form.get('customerPhone'),
            deliveryMethod,
            address: deliveryMethod === 'shipping' ? form.get('address') : null,
            notes: form.get('notes') || null,
            items: items.map(item => ({
              productId: item.product.id,
              quantity: item.quantity,
            })),
          }),
        },
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMessage(data?.message ?? 'No se pudo crear el pedido.');
        return;
      }

      const checkoutUrl = data?.payment?.checkoutUrl;
      if (!checkoutUrl) {
        setMessage('No se recibió la URL de pago de Mercado Pago.');
        return;
      }

      localStorage.setItem('last_pending_order', data.order.id);
      window.location.assign(checkoutUrl);
    } catch {
      setMessage('No se pudo conectar con el servidor.');
    } finally {
      setSaving(false);
    }
  }

  if (!items.length) {
    return (
      <main className="store-shell">
        <div className="store-empty">
          <p>No hay productos para finalizar.</p>
          <Link href="/tienda" className="btn primary">Ir a la tienda</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="store-shell">
      <Link href="/carrito" className="store-link">← Volver al carrito</Link>
      <div className="checkout-layout">
        <section className="checkout-card">
          <h1>Finalizar compra</h1>
          <p className="checkout-muted">Completá tus datos y luego te vamos a llevar a Mercado Pago.</p>

          {message && <div className="cart-alert">{message}</div>}

          <form onSubmit={submit}>
            <div className="checkout-grid">
              <label className="field">
                Nombre y apellido
                <input name="customerName" required />
              </label>
              <label className="field">
                Teléfono
                <input name="customerPhone" required />
              </label>
              <label className="field full-field">
                Email
                <input name="customerEmail" type="email" required />
              </label>
            </div>

            <h3>Entrega</h3>
            <div className="delivery-options">
              <label className={deliveryMethod === 'pickup' ? 'delivery-option selected' : 'delivery-option'}>
                <input
                  type="radio"
                  name="delivery"
                  value="pickup"
                  checked={deliveryMethod === 'pickup'}
                  onChange={() => setDeliveryMethod('pickup')}
                />
                <span><strong>Retiro</strong><small>Retiro por el comercio.</small></span>
              </label>

              <label className={deliveryMethod === 'shipping' ? 'delivery-option selected' : 'delivery-option'}>
                <input
                  type="radio"
                  name="delivery"
                  value="shipping"
                  checked={deliveryMethod === 'shipping'}
                  onChange={() => setDeliveryMethod('shipping')}
                />
                <span><strong>Envío</strong><small>Enviar a una dirección.</small></span>
              </label>
            </div>

            {deliveryMethod === 'shipping' && (
              <label className="field">
                Dirección
                <input name="address" required placeholder="Calle, número, localidad" />
              </label>
            )}

            <label className="field">
              Observaciones (opcional)
              <textarea name="notes" rows={4} maxLength={500} placeholder="Aclaraciones para el comercio" />
            </label>

            <button className="btn primary checkout-submit" type="submit" disabled={saving}>
              {saving ? 'Preparando pago...' : 'Ir a pagar con Mercado Pago'}
            </button>
          </form>
        </section>

        <aside className="cart-summary checkout-summary">
          <h2>Tu pedido</h2>
          <div className="checkout-items">
            {items.map(item => (
              <div className="checkout-item" key={item.product.id}>
                <span>{item.quantity} × {item.product.name}</span>
                <strong>
                  $ {(Number(item.product.offerPrice ?? item.product.price) * item.quantity).toLocaleString('es-AR')}
                </strong>
              </div>
            ))}
          </div>
          <div className="cart-summary-row checkout-total">
            <span>Total</span>
            <strong>$ {subtotal.toLocaleString('es-AR')}</strong>
          </div>
          <small>El total se vuelve a calcular en el servidor antes de crear el pedido.</small>
        </aside>
      </div>
    </main>
  );
}
