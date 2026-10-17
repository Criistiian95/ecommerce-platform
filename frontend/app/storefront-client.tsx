'use client';
import AccountMenu from './store-account-menu';
import SocialLinks, { whatsappHref } from './store-social-links';
import CartIcon from './cart-icon';
import { onColor } from './store-colors';
import { storeCover } from './store-covers';
import { storeFont } from './store-fonts';
import {CSSProperties,useEffect,useRef,useState} from 'react';
import Link from './store-link';
import {useCart} from './cart-context';
import {useCustomerAuth} from './customer-auth-context';
import StoreProductCard from './store-product-card';
import {API_URL,StoreCatalog} from './storefront-types';
import { useStorefront } from './storefront-context';

function TruckIcon({className}:{className?:string}){
  return <svg className={className} viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 5h11v12H3zM14 9h4l3 4v4h-7z"/><circle cx="7.5" cy="18" r="1.8"/><circle cx="17.5" cy="18" r="1.8"/></svg>;
}

function CardIcon(){
  return <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h5"/></svg>;
}

function ShieldIcon(){
  return <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2 4 5v6c0 5.3 3.4 9 8 11 4.6-2 8-5.7 8-11V5z"/><path d="m8.7 12 2.3 2.4 4.6-4.8"/></svg>;
}

export default function StorefrontClient({demoMode=false}:{demoMode?:boolean}){
  const { slug: COMMERCE_SLUG } = useStorefront();
  const isCfz=COMMERCE_SLUG==='cfz-carpinteria';
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
      const text=(key:string,max:number)=>typeof d[key]==='string'&&d[key].length<=max?d[key]:null;
      setDesignPreview({headerTagline:text('headerTagline',180),headerDisplay:d.headerDisplay==='logo-name'?'logo-name':'logo',accountDisplay:d.accountDisplay==='text'?'text':'icon',whatsapp:text('whatsapp',60),instagramUrl:text('instagramUrl',500),facebookUrl:text('facebookUrl',500),tiktokUrl:text('tiktokUrl',500),youtubeUrl:text('youtubeUrl',500),heroTitle:text('heroTitle',180),heroButtonText:text('heroButtonText',40),announcementText:text('announcementText',160),heroLayout:d.heroLayout==='banner'?'banner':'split',backgroundColor:/^#[0-9a-f]{6}$/i.test(d.backgroundColor)?d.backgroundColor:'#f7f9fd',coverPreset:d.coverPreset,coverUrl:cover,hasUploadedCover:false,name:d.name,tagline:d.tagline,primaryColor:d.primaryColor,secondaryColor:d.secondaryColor,fontFamily:d.fontFamily,logoUrl:logo,hasUploadedLogo:false});
    };
    const blockActions=(event:Event)=>{
      const target=event.target instanceof Element?event.target.closest('a,button,form'):null;
      if(!target)return;
      if(target instanceof HTMLAnchorElement && target.getAttribute('href')==='#catalogo')return;
      // Filters and sort remain usable; cart and checkout actions stay disabled.
      if(target.closest('.category-filters,.catalog-toolbar,.store-menu,.store-account-trigger'))return;
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
  const searchInput=useRef<HTMLInputElement>(null);
  const [offers,setOffers]=useState(false);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();setError('');setCatalog(null);setDesignPreview({});
    fetch(`${API_URL}/catalog/store/${COMMERCE_SLUG}`,{signal:controller.signal})
      .then(async r=>{if(!r.ok)throw new Error();setCatalog(await r.json());})
      .catch(e=>{if(e.name!=='AbortError')setError('No pudimos cargar los productos. Intentá nuevamente.');});
    return ()=>controller.abort();
  },[attempt,COMMERCE_SLUG]);
  const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const commerce=catalog?.commerce ? {...catalog.commerce, ...designPreview} : undefined;
  const brandName=commerce?.name ?? '';
  const tagline=commerce?.tagline ?? '';
  const headerTagline=commerce?.headerTagline ?? tagline;
  const showName=commerce?.headerDisplay==='logo-name';
  const logoSrc=commerce?.hasUploadedLogo
    ? `${API_URL}/catalog/store/${COMMERCE_SLUG}/logo?v=${encodeURIComponent(commerce.updatedAt || "")}`
    : commerce?.logoUrl ?? '';
  const coverSrc=commerce ? (commerce.coverUrl ?? storeCover(commerce)) : '';
  const whatsappLink=whatsappHref(commerce?.whatsapp);
  const themeStyle={
    '--store-font':storeFont(commerce?.fontFamily),
    '--store-background':isCfz && (!commerce?.backgroundColor || commerce.backgroundColor==='#f7f9fd') ? '#faf5ed' : commerce?.backgroundColor || '#f7f9fd',
    '--on-accent':onColor(commerce?.primaryColor || '#245ce6'),
    '--accent':commerce?.primaryColor || '#245ce6',
    '--ink':commerce?.secondaryColor || '#172238',
  } as CSSProperties;
  const products=(catalog?.products??[]).filter(p=>(!category||p.category?.id===category)&&(!offers||(p.offerPrice!==null&&p.offerPrice!==undefined&&Number(p.offerPrice)<Number(p.price)))&&normalize(`${p.name} ${p.brand??''} ${p.category?.name??''}`).includes(normalize(query.trim()))).sort((a,b)=>sort==='low'?Number(a.offerPrice??a.price)-Number(b.offerPrice??b.price):sort==='high'?Number(b.offerPrice??b.price)-Number(a.offerPrice??a.price):sort==='name'?a.name.localeCompare(b.name,'es'):Number(b.featured)-Number(a.featured));
  if(!catalog || catalog.commerce.slug!==COMMERCE_SLUG) return <div className="store-loading" role={error?'alert':'status'} aria-busy={!error}>{error?<><p>{error}</p><button className="btn primary" onClick={()=>setAttempt(n=>n+1)}>Reintentar</button></>:<><span className="loading-shape" aria-hidden="true"/><p>Cargando tienda…</p></>}</div>;
  return <div className={`commerce-theme${isCfz?' cfz-storefront':''}`} style={themeStyle}>
    <div className="store-masthead"><div className="store-announcement">{isCfz?<span className="store-announcement-shipping"><TruckIcon/>Envíos a todo el país</span>:demoMode?'DEMO INTERACTIVA · RECORRÉ LA TIENDA COMO CLIENTE':(commerce?.announcementText || `${brandName.toUpperCase()} · TIENDA ONLINE`)}</div>
    <header className="store-header">
      <Link href="/tienda" aria-label={`Ir al inicio de ${brandName}`} className="store-identity cfz-identity">{logoSrc?<img className="store-logo" src={logoSrc} alt={brandName}/>:<span className="store-monogram" aria-hidden="true">{brandName.charAt(0).toUpperCase()}</span>}{(showName || headerTagline)&&<div className="store-identity-caption">{showName&&<strong className="store-brand">{brandName}</strong>}{headerTagline&&<small className="cfz-tagline">{headerTagline}</small>}</div>}</Link>
      <div className="store-header-actions"><a className="store-nav-link store-search-icon" href="#catalogo" aria-label="Buscar productos" title="Buscar productos" onClick={()=>window.setTimeout(()=>searchInput.current?.focus(),0)}><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="7"/><path d="m16 16 5 5"/></svg></a><AccountMenu display={commerce?.accountDisplay} signedIn={!!user}/><Link className="store-cart-icon" href="/carrito" aria-label={`Carrito: ${totalItems} productos`} title="Ver carrito"><CartIcon/><span className="cart-count" aria-hidden="true">{totalItems}</span></Link></div>
    </header>
    <nav className="store-menu" aria-label="Menú de la tienda"><a href="#catalogo" onClick={()=>setCategory('')}>Todos los productos</a>{catalog.categories.map(c=><a key={c.id} href="#catalogo" aria-current={category===c.id?'true':undefined} onClick={()=>setCategory(c.id)}>{c.name}</a>)}<a href="#contacto-tienda">Contacto</a></nav></div>
    <div className="store-content">
    <section className={`store-hero ${coverSrc?'with-cover':'without-cover'} ${commerce?.heroLayout==='banner'&&coverSrc?'hero-banner':''}`}>
      <div className="hero-copy"><span className="eyebrow">COMPRA ONLINE</span><h1>{commerce?.heroTitle || <>Todo lo que buscás,<br/><em>en {brandName}.</em></>}</h1><p>{commerce?.tagline || 'Explorá nuestro catálogo, elegí tus productos y comprá de forma simple y segura.'}</p><a className="btn primary" href="#catalogo">{commerce?.heroButtonText || 'Ver productos'} <span aria-hidden="true">↗</span></a></div>
      {coverSrc&&<div className="hero-cover"><img src={coverSrc} alt=""/></div>}
    </section>
    {isCfz?<div className="store-benefits cfz-benefits" aria-label="Beneficios de comprar en nuestra tienda"><span><CardIcon/>Pagá con tarjeta</span><span><TruckIcon/>Envíos a todo el país</span><span><ShieldIcon/>Compra segura</span></div>:<div className="store-benefits"><span><b>01</b> Elegí tus productos</span><span><b>02</b> Armá tu carrito</span><span><b>03</b> Pagá con Mercado Pago</span></div>}
    <section className="store-section" id="catalogo">
      <div className="store-section-head"><div><span className="eyebrow">EXPLORÁ EL CATÁLOGO</span><h2>Nuestros productos</h2></div><span aria-live="polite">{products.length} {products.length===1?'producto':'productos'}</span></div>
      <div className="catalog-toolbar"><label className="catalog-search"><span aria-hidden="true">⌕</span><input ref={searchInput} type="search" aria-label="Buscar productos" placeholder="Buscar por producto o marca…" value={query} onChange={e=>setQuery(e.target.value)}/></label><label className="catalog-sort">Ordenar por<select value={sort} onChange={e=>setSort(e.target.value)}><option value="featured">Destacados</option><option value="low">Menor precio</option><option value="high">Mayor precio</option><option value="name">Nombre: A a Z</option></select></label></div>
      <div className="category-filters" aria-label="Filtros del catálogo"><button className={!category?'active':''} aria-pressed={!category} onClick={()=>setCategory('')}>Todos</button>{catalog?.categories.map(c=><button key={c.id} className={category===c.id?'active':''} aria-pressed={category===c.id} onClick={()=>setCategory(c.id)}>{c.name}</button>)}<button className={offers?'active offer-filter':'offer-filter'} aria-pressed={offers} onClick={()=>setOffers(!offers)}>Solo ofertas</button></div>
      {error?<div className="store-empty" role="alert"><h3>No pudimos abrir el catálogo</h3><p>{error}</p><button className="btn primary" onClick={()=>setAttempt(n=>n+1)}>Reintentar</button></div>:!catalog?<div className="store-empty" role="status">Estamos preparando el catálogo…</div>:<><div className="product-grid">{products.map(p=><StoreProductCard key={p.id} product={p}/>)}</div>{!products.length&&<div className="store-empty"><h3>{catalog.products.length?'No encontramos coincidencias':'Próximamente, nuevos productos'}</h3><p>{catalog.products.length?'Probá otra búsqueda o cambiá los filtros.':'Volvé a visitarnos para conocer el catálogo.'}</p>{catalog.products.length>0&&<button className="btn secondary" onClick={()=>{setQuery('');setCategory('');setOffers(false);}}>Limpiar filtros</button>}</div>}</>}
    </section>
    <footer className="store-footer" id="contacto-tienda"><div><strong>{brandName}</strong><p>{commerce?.address || tagline}</p>{commerce?.businessHours&&<small className="store-hours">{commerce.businessHours}</small>}</div>{commerce&&<SocialLinks commerce={commerce}/>}{commerce?.contactEmail&&<a href={`mailto:${commerce.contactEmail}`}>{commerce.contactEmail}</a>}<Link href={user?'/mi-cuenta':'/cliente/login'}>{user?'Mi cuenta':'Cuenta cliente'}</Link><Link href="/carrito" aria-label="Ver carrito" title="Ver carrito"><CartIcon/></Link><Link href="/login">Acceso para comercios</Link></footer>{whatsappLink&&<a className="store-whatsapp-button" href={whatsappLink} target="_blank" rel="noopener noreferrer" aria-label="Contactar al comercio por WhatsApp">WhatsApp ↗</a>}</div>
  </div>;
}
