import { STOREFRONT_DOMAIN, tenantSlugFromHost } from '../app/tenant-host';

const pages = {
  '/': 'home', '/contacto': 'contact', '/demo': 'demo',
  '/registro': 'registration', '/login': 'login', '/setup': 'setup',
  '/recuperar': 'recovery', '/admin': 'admin',
  '/admin/dashboard': 'dashboard', '/admin/personalizar': 'design',
  '/admin/configuracion': 'settings', '/admin/clientes': 'customers',
  '/admin/pedidos': 'orders',
} as const;
const shopPages = {
  '/tienda': 'store', '/carrito': 'cart', '/checkout': 'checkout',
  '/cliente/login': 'customerLogin', '/cliente/registro': 'customerRegistration',
  '/cliente/recuperar': 'customerRecovery', '/mi-cuenta': 'account',
  '/pago/resultado': 'payment',
} as const;
export type Page = typeof pages[keyof typeof pages] | typeof shopPages[keyof typeof shopPages] | 'product';
export type ResolvedRoute = {
  page?: Page;
  domainSlug: string | null;
  params: { slug?: string; id?: string };
  storefront: boolean;
  redirect?: string;
};

// Resolve the tenant before mounting any provider or requesting a catalogue.
// New shops/products work immediately; no build-time list of slugs is required.
export function resolveStaticRoute(host: string, pathname: string, search = ''): ResolvedRoute {
  const domainSlug = tenantSlugFromHost(host);
  const result: ResolvedRoute = { domainSlug, params: {}, storefront: false };
  const hostname = host.toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  const suffix = '.' + STOREFRONT_DOMAIN.toLowerCase();
  const sub = hostname.endsWith(suffix) ? hostname.slice(0, -suffix.length) : null;
  let path = pathname.replace(/\/+$/, '') || '/';

  if (sub && !domainSlug) {
    if (sub === 'www') result.redirect = `https://${STOREFRONT_DOMAIN}${path}${search}`;
    return result;
  }
  if (domainSlug) {
    if (/^\/(admin|login|setup|recuperar)(\/|$)/.test(path)) {
      result.page = pages[path as keyof typeof pages];
      return result;
    }
    if (path === '/registro' || /^\/demo(\/|$)/.test(path)) {
      result.redirect = `https://${STOREFRONT_DOMAIN}${path}${search}`;
      return result;
    }
    if (path.startsWith('/tienda/')) {
      const match = /^\/tienda\/([^/]+)(\/.*)?$/.exec(path);
      result.redirect = (match?.[1] === domainSlug ? match[2] || '/' : '/') + search;
      return result;
    }
    if (path === '/') path = '/tienda';
  } else if (path.startsWith('/tienda/')) {
    const match = /^\/tienda\/([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\/.*)?$/.exec(path);
    if (!match) return result;
    result.params.slug = match[1];
    path = match[2] || '/tienda';
  }

  const product = /^\/producto\/([^/]+)$/.exec(path);
  if (product) {
    try {
      const id = decodeURIComponent(product[1]);
      // IDs are opaque, but must never change the API path or query string.
      if (!/^[a-zA-Z0-9_-]+$/.test(id)) return result;
      result.params.id = id;
      result.page = 'product';
    } catch { return result; }
  } else {
    result.page = shopPages[path as keyof typeof shopPages];
  }
  if (result.page) {
    result.storefront = true;
  } else if (!domainSlug && !result.params.slug) {
    result.page = pages[path as keyof typeof pages];
    result.storefront = result.page === 'demo';
  }
  return result;
}
