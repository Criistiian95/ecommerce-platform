export function isPlatformVisit(hostname: string, path: string, tenantDomain: boolean, domain: string): boolean {
  const host = hostname.toLowerCase();
  const base = domain.toLowerCase();
  return !tenantDomain && (host === base || host === `www.${base}`) &&
    ['/', '/registro', '/contacto', '/demo', '/login', '/recuperar'].includes(path);
}
