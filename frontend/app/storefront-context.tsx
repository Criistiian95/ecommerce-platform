'use client';
import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';
import { useParams } from 'next/navigation';
import { storePath } from './storefront-routing';
import { COMMERCE_SLUG } from './storefront-config';
import { CartProvider } from './cart-context';
import { CustomerAuthProvider } from './customer-auth-context';
import { CommerceThemeProvider } from './commerce-theme-provider';
import { tenantSlugFromHost } from './tenant-host';

type Store = { slug: string; isTenantDomain: boolean; path: (href: string) => string };
const Context = createContext<Store>({ slug: COMMERCE_SLUG, isTenantDomain: false, path: href => href });
// A hostname cannot change without a navigation to another origin.
const subscribeToHost = () => () => {};
export function StorefrontProvider({ children, domainSlug }: { children: React.ReactNode; domainSlug: string | null }) {
  const params = useParams<{ slug?: string }>();
  // An internal rewrite can replace the server's Host header with localhost.
  // After hydration, use the browser's actual hostname to recover the tenant.
  const currentDomainSlug = useSyncExternalStore(
    subscribeToHost,
    () => tenantSlugFromHost(window.location.host),
    () => domainSlug,
  );
  const slug = currentDomainSlug || params.slug || COMMERCE_SLUG;
  const value = useMemo(() => ({
    slug,
    isTenantDomain: Boolean(currentDomainSlug),
    path: (href: string) => storePath(params.slug, href, Boolean(currentDomainSlug)),
  }), [slug, params.slug, currentDomainSlug]);
  return <Context.Provider value={value}><CommerceThemeProvider key={slug}><CustomerAuthProvider key={slug}><CartProvider key={slug}>{children}</CartProvider></CustomerAuthProvider></CommerceThemeProvider></Context.Provider>;
}
export function useStorefront() { return useContext(Context); }
