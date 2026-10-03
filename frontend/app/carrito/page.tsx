'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useCart } from '../cart-context';
import { API_URL } from '../storefront-types';
import '../tienda/store.module.css';

export default function CartPage() {
  const { items, subtotal, setQuantity, removeProduct, clearCart } = useCart();
  const [message, setMessage] = useState('');

  async function change(productId: string, quantity: number) {
    const result = await setQuantity(productId, quantity);
    if (!result.ok) {
      setMessage(result.message ?? 'No se pudo actualizar la cantidad.');
      window.setTimeout(() => setMessage(''), 2500);
    }
  }

  return (
    <main className="store-shell">
      <div className="cart-header">
        <div>
          <Link href="/tienda" className="store-link">← Seguir comprando</Link>
          <h1>Carrito</h1>
        </div>
        {items.length > 0 && <button className="btn secondary" onClick={clearCart}>Vaciar carrito</button>}
      </div>

      {message && <div className="cart-alert">{message}</div>}

      {items.length === 0 ? (
        <div className="store-empty">Tu carrito está vacío.</div>
      ) : (
        <div className="cart-layout">
          <section className="cart-list">
            {items.map(item => {
              const image = item.product.hasUploadedImage
                ? `${API_URL}/catalog/products/${item.product.id}/image`
                : item.product.imageUrl || null;
              const unitPrice = Number(item.product.offerPrice ?? item.product.price);

              return (
                <article className="cart-item" key={item.product.id}>
                  {image ? <img src={image} alt={item.product.name} /> : <div className="cart-item-placeholder">Sin imagen</div>}
                  <div className="cart-item-info">
                    <strong>{item.product.name}</strong>
                    {item.product.brand && <small>{item.product.brand}</small>}
                    <span>$ {unitPrice.toLocaleString('es-AR')}</span>
                  </div>
                  <div className="cart-quantity">
                    <button onClick={() => change(item.product.id, item.quantity - 1)}>−</button>
                    <span>{item.quantity}</span>
                    <button onClick={() => change(item.product.id, item.quantity + 1)}>+</button>
                  </div>
                  <div className="cart-line-total">$ {(unitPrice * item.quantity).toLocaleString('es-AR')}</div>
                  <button className="cart-remove" onClick={() => removeProduct(item.product.id)}>Quitar</button>
                </article>
              );
            })}
          </section>

          <aside className="cart-summary">
            <h2>Resumen</h2>
            <div className="cart-summary-row"><span>Subtotal</span><strong>$ {subtotal.toLocaleString('es-AR')}</strong></div>
            <Link className="btn primary" href="/checkout">Continuar compra</Link>
            <small>Vas a revisar tus datos antes de confirmar el pedido.</small>
          </aside>
        </div>
      )}
    </main>
  );
}
