'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useCart } from '../../cart-context';
import { API_URL, StoreProduct } from '../../storefront-types';
import { COMMERCE_SLUG } from '../../storefront-config';

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const { addProduct } = useCart();
  const [product, setProduct] = useState<StoreProduct | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/catalog/store/${COMMERCE_SLUG}/products/${params.id}`)
      .then(async response => {
        if (!response.ok) throw new Error();
        setProduct(await response.json());
      })
      .catch(() => setMessage('No se pudo cargar el producto.'));
  }, [params.id]);

  if (!product) {
    return <main className="store-shell"><div className="store-empty">{message || 'Cargando producto...'}</div></main>;
  }

  const image = product.hasUploadedImage
    ? `${API_URL}/catalog/products/${product.id}/image`
    : product.imageUrl || null;

  async function add() {
    const result = await addProduct(product);
    setMessage(result.ok ? 'Agregado al carrito.' : (result.message ?? 'No se pudo agregar.'));
  }

  return (
    <main className="store-shell">
      <Link href="/tienda" className="store-link">← Volver a la tienda</Link>
      <section className="product-detail">
        <div className="product-detail-image-wrap">
          {image ? <img src={image} alt={product.name} className="product-detail-image" /> : <div className="product-detail-image placeholder">Sin imagen</div>}
        </div>
        <div className="product-detail-content">
          {product.brand && <small>{product.brand}</small>}
          <h1>{product.name}</h1>
          {product.category && <span className="store-category">{product.category.name}</span>}
          {product.description && <p>{product.description}</p>}
          <div className="store-price product-detail-price">
            {product.offerPrice ? (
              <>
                <small>$ {Number(product.price).toLocaleString('es-AR')}</small>
                <strong>$ {Number(product.offerPrice).toLocaleString('es-AR')}</strong>
              </>
            ) : <strong>$ {Number(product.price).toLocaleString('es-AR')}</strong>}
          </div>
          <button className="btn primary" disabled={!product.available} onClick={add}>
            {product.available ? 'Agregar al carrito' : 'Sin stock'}
          </button>
          {message && <p className="cart-feedback">{message}</p>}
        </div>
      </section>
    </main>
  );
}
