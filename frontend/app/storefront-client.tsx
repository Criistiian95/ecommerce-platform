'use client';
import { storeCover } from './store-covers';
import { storeFont } from './store-fonts';
import {CSSProperties,useEffect,useState} from 'react';
import Link from './store-link';
import {useCart} from './cart-context';
import {useCustomerAuth} from './customer-auth-context';
import StoreProductCard from './store-product-card';
import {API_URL,StoreCatalog} from './storefront-types';
import { useStorefront } from './storefront-context';

export default function StorefrontClient({demoMode=false}:{demoMode?:boolean}){
  const { slug: COMMERCE_SLUG } = useStorefront();
  const {totalItems}=useCart();
  const {user}=useCustomerAuth();
  const [catalog,setCatalog]=useState<StoreCatalog|null>(null);
  const [designPreview,setDesignPreview]=useState<Partial<StoreCatalog['commerce']>>({});
  useEffect(()=>{
    if(window.parent===window || new URLSearchParams(window.location.search).get('personalizar')!=='1') return;
    const receive=(event:MessageEvent)=>{
      if(event.origin!==window.location.origin || event.source!==window.parent || event.data?.type!=='disenolys-design') return;
      const d=event.data.design;
      if(!d || typeof d.name!=='string' || d.name.length>120 || typeof d.tagline!=='string' || d.tagline.length>180 || !/^#[0-9a-f]{6}$/i.test(d.primaryColor) || !/^#[0-9a-f]{6}$/i.test(d.secondaryColor)) return;
      const logo=typeof d.logoUrl==='string' && /^(https?:\/\/|data:image\/(png|jpeg|webp);base64,)/.test(d.logoUrl) ? d.logoUrl : null;
      const cover=typeof d.coverUrl==='string' && /^(https?:\/\/|data:image\/(png|jpeg|webp);base64,|\/covers\/(oak|workshop|home)\.webp$)/.test(d.coverUrl) ? d.coverUrl : '';
      setDesignPreview({backgroundColor:/^#[0-9a-f]{6}$/i.test(d.backgroundColor)?d.backgroundColor:'#f7f9fd',coverPreset:d.coverPreset,coverUrl:cover,hasUploadedCover:false,name:d.name,tagline:d.tagline,primaryColor:d.primaryColor,secondaryColor:d.secondaryColor,fontFamily:d.fontFamily,logoUrl:logo,hasUploadedLogo:false});
    };
    const blockActions=(event:Event)=>{
      const target=event.target instanceof Element?event.target.closest('a,button,form'):null;
      if(!target)return;
      if(target instanceof HTMLAnchorElement && target.getAttribute('href')==='#catalogo')return;
      // Filters and sort remain usable; cart and checkout actions stay disabled.
      if(target.closest('.category-filters,.catalog-toolbar'))return;
      event.preventDefault();event.stopPropagation();
    };
    document.addEventListener('click',blockActions,true);
    document.addEventListener('submit',blockActions,true);
    window.addEventListener('message',receive);
    window.parent.postMessage({type:'disenolys-preview-ready'},window.location.origin);
    return ()=>{window.removeEventListener('message',receive);document.removeEventListener('click',blockActions,true);document.removeEventListener('submit',blockActions,true);};
  },[]);
  const [error,setError]=useState('');
  const [query,setQuery]=useState('');
  const [category,setCategory]=useState('');
  const [sort,setSort]=useState('featured');
  const [offers,setOffers]=useState(false);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();setError('');
    fetch(`${API_URL}/catalog/store/${COMMERCE_SLUG}`,{signal:controller.signal})
      .then(async r=>{if(!r.ok)throw new Error();setCatalog(await r.json());})
      .catch(e=>{if(e.name!=='AbortError')setError('No pudimos cargar los productos. Intentá nuevamente.');});
    return ()=>controller.abort();
  },[attempt,COMMERCE_SLUG]);
  const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const commerce=catalog?.commerce ? {...catalog.commerce, ...designPreview} : undefined;
  const brandName=commerce?.name ?? 'Tienda Demo';
  const tagline=commerce?.tagline ?? 'E-commerce para tu negocio';
  const logoSrc=commerce?.hasUploadedLogo
    ? `${API_URL}/catalog/store/${COMMERCE_SLUG}/logo?v=${encodeURIComponent(commerce.updatedAt || "")}`
    : commerce?.logoUrl ?? '';
  const coverSrc=commerce ? (commerce.coverUrl ?? storeCover(commerce)) : '';
  const whatsappNumber=(commerce?.whatsapp ?? '').replace(/\D/g,'');
  const themeStyle={
    '--store-font':storeFont(commerce?.fontFamily),
    '--store-background':commerce?.backgroundColor || '#f7f9fd',
    '--accent':commerce?.primaryColor || '#245ce6',
    '--ink':commerce?.secondaryColor || '#172238',
  } as CSSProperties;
  const products=(catalog?.products??[]).filter(p=>(!category||p.category?.id===category)&&(!offers||(p.offerPrice!==null&&p.offerPrice!==undefined&&Number(p.offerPrice)<Number(p.price)))&&normalize(`${p.name} ${p.brand??''} ${p.category?.name??''}`).includes(normalize(query.trim()))).sort((a,b)=>sort==='low'?Number(a.offerPrice??a.price)-Number(b.offerPrice??b.price):sort==='high'?Number(b.offerPrice??b.price)-Number(a.offerPrice??a.price):sort==='name'?a.name.localeCompare(b.name,'es'):Number(b.featured)-Number(a.featured));
  return <div className="commerce-theme" style={themeStyle}>
    <div className="store-announcement">{demoMode?'DEMO INTERACTIVA · RECORRÉ LA TIENDA COMO CLIENTE':`${brandName.toUpperCase()} · TIENDA ONLINE`}</div>
    <header className="store-header">
      <Link href="/tienda" className="store-identity">{logoSrc?<img className="store-logo" src={logoSrc} alt={brandName}/>:<span className="store-monogram" aria-hidden="true">{brandName.charAt(0).toUpperCase()}</span>}<div><div className="store-brand">{brandName}</div><small>{tagline}</small></div></Link>
      <div className="store-header-actions"><a className="store-nav-link" href="#catalogo">Explorar catálogo</a><Link className="store-nav-link" href={user?'/mi-cuenta':'/cliente/login'}>{user?'Mi cuenta':'Ingresar'}</Link><Link className="btn primary" href="/carrito">Carrito <span className="cart-count">{totalItems}</span></Link></div>
    </header>
    <section className={`store-hero ${coverSrc?'with-cover':'without-cover'}`}>
      <div className="hero-copy"><span className="eyebrow">COMPRA ONLINE</span><h1>Todo lo que buscás,<br/><em>en {brandName}.</em></h1><p>{commerce?.tagline || 'Explorá nuestro catálogo, elegí tus productos y comprá de forma simple y segura.'}</p><a className="btn primary" href="#catalogo">Ver productos <span aria-hidden="true">↗</span></a></div>
      {coverSrc&&<div className="hero-cover"><img src={coverSrc} alt=""/></div>}
    </section>
    <div className="store-benefits"><span><b>01</b> Elegí tus productos</span><span><b>02</b> Armá tu carrito</span><span><b>03</b> Pagá con Mercado Pago</span></div>
    <section className="store-section" id="catalogo">
      <div className="store-section-head"><div><span className="eyebrow">EXPLORÁ EL CATÁLOGO</span><h2>Nuestros productos</h2></div><span aria-live="polite">{products.length} {products.length===1?'producto':'productos'}</span></div>
      <div className="catalog-toolbar"><label className="catalog-search"><span aria-hidden="true">⌕</span><input type="search" aria-label="Buscar productos" placeholder="Buscar por producto o marca…" value={query} onChange={e=>setQuery(e.target.value)}/></label><label className="catalog-sort">Ordenar por<select value={sort} onChange={e=>setSort(e.target.value)}><option value="featured">Destacados</option><option value="low">Menor precio</option><option value="high">Mayor precio</option><option value="name">Nombre: A a Z</option></select></label></div>
      <div className="category-filters" aria-label="Filtros del catálogo"><button className={!category?'active':''} aria-pressed={!category} onClick={()=>setCategory('')}>Todos</button>{catalog?.categories.map(c=><button key={c.id} className={category===c.id?'active':''} aria-pressed={category===c.id} onClick={()=>setCategory(c.id)}>{c.name}</button>)}<button className={offers?'active offer-filter':'offer-filter'} aria-pressed={offers} onClick={()=>setOffers(!offers)}>Solo ofertas</button></div>
      {error?<div className="store-empty" role="alert"><h3>No pudimos abrir el catálogo</h3><p>{error}</p><button className="btn primary" onClick={()=>setAttempt(n=>n+1)}>Reintentar</button></div>:!catalog?<div className="store-empty" role="status">Estamos preparando el catálogo…</div>:<><div className="product-grid">{products.map(p=><StoreProductCard key={p.id} product={p}/>)}</div>{!products.length&&<div className="store-empty"><h3>{catalog.products.length?'No encontramos coincidencias':'Próximamente, nuevos productos'}</h3><p>{catalog.products.length?'Probá otra búsqueda o cambiá los filtros.':'Volvé a visitarnos para conocer el catálogo.'}</p>{catalog.products.length>0&&<button className="btn secondary" onClick={()=>{setQuery('');setCategory('');setOffers(false);}}>Limpiar filtros</button>}</div>}</>}
    </section>
    <footer className="store-footer"><div><strong>{brandName}</strong><p>{commerce?.address || tagline}</p>{commerce?.businessHours&&<small className="store-hours">{commerce.businessHours}</small>}</div>{whatsappNumber&&<a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noreferrer">WhatsApp</a>}{commerce?.contactEmail&&<a href={`mailto:${commerce.contactEmail}`}>{commerce.contactEmail}</a>}<Link href={user?'/mi-cuenta':'/cliente/login'}>{user?'Mi cuenta':'Cuenta cliente'}</Link><Link href="/carrito">Carrito</Link><Link href="/login">Acceso para comercios</Link></footer>
  </div>;
}
