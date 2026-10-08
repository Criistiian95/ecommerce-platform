export function storePath(slug: string | undefined, href: string): string {
  if (!slug) return href;
  const prefix = `/tienda/${encodeURIComponent(slug)}`;
  if (href === '/tienda') return prefix;
  if (/^\/(producto|carrito|checkout|cliente|mi-cuenta|pago)(\/|\?|$)/.test(href)) return prefix + href;
  return href;
}
export function customerDestination(next: string | null): string {
  return next === '/checkout' ? '/checkout' : '/mi-cuenta';
}
export function storeStorageKey(kind: string, slug: string): string {
  return `${kind}:${slug}`;
}
