export const STOREFRONT_DOMAIN = process.env.NEXT_PUBLIC_STOREFRONT_DOMAIN || 'disenolys.store';

const RESERVED = new Set(['www','api','admin','app','dashboard','mail','email','smtp','ftp','static','assets','cdn','demo','support','ayuda','blog','checkout','tienda','login','panel','status','dev','staging','test']);

export function tenantSlugFromHost(host: string | null): string | null {
  if (!host) return null;
  const hostname = host.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  const suffix = '.' + STOREFRONT_DOMAIN.toLowerCase();
  if (!hostname.endsWith(suffix)) return null;
  const subdomain = hostname.slice(0, -suffix.length);
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain) || RESERVED.has(subdomain)) return null;
  return subdomain;
}
