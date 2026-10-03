'use client';

import { API_URL, StoreProduct } from './storefront-types';

export default function StoreProductCard({ product }: { product: StoreProduct }) {
  const image = product.hasUploadedImage
    ? `${API_URL}/catalog/products/${product.id}/image`
    : product.imageUrl || null;

  return (
    <article className="store-product-card">
      <div className="store-product-image-wrap">
        {product.featured && <span className="store-badge">Destacado</span>}
        {image ? (
          <img
            src={image}
            alt={product.name}
            className="store-product-image"
          />
        ) : (
          <div className="store-product-image placeholder">Sin imagen</div>
        )}
      </div>

      <div className="store-product-content">
        {product.brand && <small>{product.brand}</small>}
        <h3>{product.name}</h3>
        {product.category && (
          <span className="store-category">{product.category.name}</span>
        )}
        {product.description && <p>{product.description}</p>}

        <div className="store-product-bottom">
          <div className="store-price">
            {product.offerPrice ? (
              <>
                <small>
                  $ {Number(product.price).toLocaleString('es-AR')}
                </small>
                <strong>
                  $ {Number(product.offerPrice).toLocaleString('es-AR')}
                </strong>
              </>
            ) : (
              <strong>
                $ {Number(product.price).toLocaleString('es-AR')}
              </strong>
            )}
          </div>

          <button
            className="btn primary"
            disabled={!product.available}
          >
            {product.available ? 'Agregar al carrito' : 'Sin stock'}
          </button>
        </div>
      </div>
    </article>
  );
}
