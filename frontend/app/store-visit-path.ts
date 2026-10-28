export function isStoreVisitPath(path: string, slug: string, tenantDomain: boolean): boolean {
  if (tenantDomain) return path === '/' || path === '/tienda' || /^\/(producto|carrito|checkout|cliente|mi-cuenta|pago)(\/|$)/.test(path);
  const prefix = `/tienda/${slug}`;
  return path === '/tienda' || path === prefix || path.startsWith(prefix + '/') ||
    /^\/(producto|carrito|checkout|cliente|mi-cuenta|pago)(\/|$)/.test(path);
}
