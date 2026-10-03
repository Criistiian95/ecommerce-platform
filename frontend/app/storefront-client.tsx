'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useCart} from './cart-context';
import StoreProductCard from './store-product-card';
import {API_URL,StoreCatalog} from './storefront-types';
import {COMMERCE_SLUG} from './storefront-config';

export default function StorefrontClient(){
  const {totalItems}=useCart();
  const [catalog,setCatalog]=useState<StoreCatalog|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{
    fetch(`${API_URL}/catalog/store/${COMMERCE_SLUG}`)
      .then(async r=>{if(!r.ok)throw new Error();setCatalog(await r.json());})
      .catch(()=>setError('No se pudo cargar el catálogo.'));
  },[]);
  if(error)return <div className="store-empty">{error}</div>;
  if(!catalog)return <div className="store-empty">Cargando tienda...</div>;
  return <>
    <header className="store-header">
      <div><div className="store-brand">{catalog.commerce.name}</div><small>Tienda online</small></div>
      <div className="store-header-actions">
        <Link className="btn secondary" href="/carrito">Carrito ({totalItems})</Link>
        <a className="btn secondary" href="/login">Administrar</a>
      </div>
    </header>
    <section className="store-hero">
      <span className="eyebrow">CATÁLOGO ONLINE</span>
      <h1>Encontrá lo que buscás.</h1>
      <p>Productos, ofertas y destacados del comercio.</p>
    </section>
    <section className="store-section">
      <div className="store-section-head"><h2>Productos</h2><span>{catalog.products.length} resultado(s)</span></div>
      <div className="product-grid">
        {catalog.products.map(p=><StoreProductCard key={p.id} product={p}/>)}
      </div>
      {!catalog.products.length&&<div className="store-empty">No hay productos para mostrar.</div>}
    </section>
  </>;
}
