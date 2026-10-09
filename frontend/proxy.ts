import { NextRequest, NextResponse } from 'next/server';
import { tenantSlugFromHost, STOREFRONT_DOMAIN } from './app/tenant-host';

const SHOP_ROUTES = /^\/(?:producto|carrito|checkout|cliente|mi-cuenta|pago)(?:\/|$)/;
const ADMIN_ROUTES = /^\/(?:admin|login|setup|recuperar)(?:\/|$)/;

export function proxy(request: NextRequest) {
  const host = request.headers.get('host') || '';
  const hostname = host.toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  const suffix = '.' + STOREFRONT_DOMAIN;
  const sub = hostname.endsWith(suffix) ? hostname.slice(0, -suffix.length) : null;
  const slug = tenantSlugFromHost(host);
  const pathname = request.nextUrl.pathname;

  // A reserved or malformed subdomain must not open the default demo storefront.
  if (sub && !slug) {
    if (sub === 'www') return NextResponse.redirect(new URL('https://' + STOREFRONT_DOMAIN + pathname + request.nextUrl.search), 308);
    return new NextResponse('Subdominio no disponible', { status: 404 });
  }
  if (!slug || ADMIN_ROUTES.test(pathname)) return NextResponse.next();

  // Demo and other company-level pages live only on the root domain.
  if (pathname === '/demo' || pathname.startsWith('/demo/')) {
    return NextResponse.redirect(new URL('https://' + STOREFRONT_DOMAIN + pathname), 307);
  }
  const url = request.nextUrl.clone();
  if (pathname === '/' || pathname === '/tienda') {
    url.pathname = '/tienda/' + slug;
    return NextResponse.rewrite(url);
  }
  if (pathname.startsWith('/tienda/')) {
    const parts = pathname.split('/');
    if (parts[2] !== slug) {
      url.pathname = '/';
      return NextResponse.redirect(url, 307);
    }
    url.pathname = pathname.replace(/^\/tienda\/[^/]+/, '') || '/';
    return NextResponse.redirect(url, 307);
  }
  if (SHOP_ROUTES.test(pathname)) {
    url.pathname = '/tienda/' + slug + pathname;
    return NextResponse.rewrite(url);
  }
  // Do not expose root-domain-only marketing routes on merchant hosts.
  return new NextResponse('Página no disponible', { status: 404 });
}

export const config = {
  matcher: ['/((?!_next/|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|webp|ico|woff2?)$).*)'],
};
