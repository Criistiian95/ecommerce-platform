import { Component, Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, useLocation } from 'react-router-dom';
import { StorefrontProvider, useStorefront } from '../app/storefront-context';
import { API_URL, type StoreCatalog } from '../app/storefront-types';
import { RouteParams } from './navigation';
import { resolveStaticRoute, type Page } from './routes';
import '../app/globals.css';
import '../app/tienda/store.module.css';
import './preview.css';

const pages = {
  home: lazy(() => import('../app/page')),
  contact: lazy(() => import('../app/contacto/page')),
  demo: lazy(() => import('../app/demo/page')),
  registration: lazy(() => import('../app/registro/page')),
  login: lazy(() => import('../app/login/page')),
  setup: lazy(() => import('../app/setup/page')),
  recovery: lazy(() => import('../app/recuperar/page')),
  admin: lazy(() => import('../app/admin/page')),
  dashboard: lazy(() => import('../app/admin/dashboard/page')),
  design: lazy(() => import('../app/admin/personalizar/page')),
  settings: lazy(() => import('../app/admin/configuracion/page')),
  customers: lazy(() => import('../app/admin/clientes/page')),
  orders: lazy(() => import('../app/admin/pedidos/page')),
  store: lazy(() => import('../app/tienda/page')),
  product: lazy(() => import('../app/producto/[id]/page')),
  cart: lazy(() => import('../app/carrito/page')),
  checkout: lazy(() => import('../app/checkout/page')),
  customerLogin: lazy(() => import('../app/cliente/login/page')),
  customerRegistration: lazy(() => import('../app/cliente/registro/page')),
  customerRecovery: lazy(() => import('../app/cliente/recuperar/page')),
  account: lazy(() => import('../app/mi-cuenta/page')),
  payment: lazy(() => import('../app/pago/resultado/page')),
} satisfies Record<Page, ReturnType<typeof lazy>>;

function Loading() {
  return <div className="store-loading" role="status"><span className="loading-shape" aria-hidden="true" /><p>Cargando…</p></div>;
}
function Unavailable({ store = false }: { store?: boolean }) {
  return <main className="static-status"><h1>{store ? 'Tienda no disponible' : 'Página no encontrada'}</h1><p>Revisá la dirección que ingresaste.</p></main>;
}
class PageError extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <main className="static-status" role="alert"><h1>No pudimos abrir la página</h1><button className="btn primary" onClick={() => window.location.reload()}>Volver a cargar</button></main> : this.props.children;
  }
}
function ExternalRedirect({ href }: { href: string }) {
  useEffect(() => { window.location.replace(href); }, [href]);
  return <Loading />;
}
function StoreBoundary({ children }: { children: ReactNode }) {
  const { slug } = useStorefront();
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    document.title = 'Diseñolys · Versión de prueba';
    fetch(`${API_URL}/catalog/store/${encodeURIComponent(slug)}`, { signal: controller.signal })
      .then(async response => {
        if (response.status === 404) { setState('missing'); return; }
        if (!response.ok) throw new Error('Catalogue unavailable');
        const catalog: StoreCatalog = await response.json();
        if (catalog.commerce.slug !== slug) throw new Error('Unexpected store');
        if (controller.signal.aborted) return;
        document.title = `${catalog.commerce.name} | Tienda online`;
        document.querySelector('meta[name="description"]')?.setAttribute('content', catalog.commerce.tagline || `Tienda online de ${catalog.commerce.name}`);
        setState('ready');
      })
      .catch(() => { if (!controller.signal.aborted) setState('error'); });
    return () => controller.abort();
  }, [slug, attempt]);
  if (state === 'loading') return <Loading />;
  if (state === 'missing') return <Unavailable store />;
  if (state === 'error') return <main className="static-status" role="alert"><h1>No pudimos conectar con la tienda</h1><p>Intentá nuevamente en unos minutos.</p><button className="btn primary" onClick={() => setAttempt(n => n + 1)}>Reintentar</button></main>;
  return children;
}
function CurrentPage() {
  const location = useLocation();
  const route = resolveStaticRoute(window.location.host, location.pathname, location.search);
  useEffect(() => {
    if (!route.storefront) {
      document.title = 'Diseñolys · Versión de prueba';
      document.querySelector('meta[name="description"]')?.setAttribute('content', 'Versión de prueba de Diseñolys. Tu tienda online, con tu identidad.');
    }
    if (!location.hash) window.scrollTo(0, 0);
  }, [location.pathname]);
  if (route.redirect) {
    const href = route.redirect + location.hash;
    return href.startsWith('https://') ? <ExternalRedirect href={href} /> : <Navigate to={href} replace />;
  }
  if (!route.page) return <Unavailable />;
  const Screen = pages[route.page];
  const page = <PageError key={location.pathname}><Suspense fallback={<Loading />}><Screen key={location.pathname + location.search} /></Suspense></PageError>;
  return <RouteParams.Provider value={route.params}><StorefrontProvider domainSlug={route.domainSlug}>
    {route.storefront ? <StoreBoundary key={route.domainSlug || route.params.slug || 'default'}>{page}</StoreBoundary> : page}
  </StorefrontProvider></RouteParams.Provider>;
}

createRoot(document.getElementById('root')!).render(<BrowserRouter><CurrentPage /></BrowserRouter>);
