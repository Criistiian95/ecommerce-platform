'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useCart } from './cart-context';
import { API_URL, StoreProduct } from './storefront-types';

export default function StoreProductCard({ product }: { product: StoreProduct }) {
  const { addProduct } = useCart();
  const [message, setMessage] = useState('');
  const image = product.hasUploadedImage
    ? `${API_URL}/catalog/products/${product.id}/image`
    : product.imageUrl || null;

  async function add() {
    const result = await addProduct(product);
    setMessage(result.ok ? 'Agregado al carrito.' : (result.message ?? 'No se pudo agregar.'));
    window.setTimeout(() => setMessage(''), 2200);
  }

  return (
    <article className="store-product-card">
      <Link href={`/producto/${product.id}`} className="store-product-image-wrap">
        {product.featured && <span className="store-badge">Destacado</span>}
        {image ? (
          <img src={image} alt={product.name} className="store-product-image" />
        ) : (
          <div className="store-product-image placeholder">Sin imagen</div>
        )}
      </Link>

      <div className="store-product-content">
        {product.brand && <small>{product.brand}</small>}
        <Link href={`/producto/${product.id}`}><h3>{product.name}</h3></Link>
        {product.category && <span className="store-category">{product.category.name}</span>}
        {product.description && <p>{product.description}</p>}

        <div className="store-product-bottom">
          <div className="store-price">
            {product.offerPrice ? (
              <>
                <small>$ {Number(product.price).toLocaleString('es-AR')}</small>
                <strong>$ {Number(product.offerPrice).toLocaleString('es-AR')}</strong>
              </>
            ) : (
              <strong>$ {Number(product.price).toLocaleString('es-AR')}</strong>
            )}
          </div>

          <button className="btn primary" disabled={!product.available} onClick={add}>
            {product.available ? 'Agregar al carrito' : 'Sin stock'}
          </button>
        </div>
        {message && <small className="cart-feedback">{message}</small>}
      </div>
    </article>
  );
}
