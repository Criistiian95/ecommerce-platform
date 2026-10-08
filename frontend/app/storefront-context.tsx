'use client';
import { createContext, useContext, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { storePath } from './storefront-routing';
import { COMMERCE_SLUG } from './storefront-config';
import { CartProvider } from './cart-context';
import { CustomerAuthProvider } from './customer-auth-context';
import { CommerceThemeProvider } from './commerce-theme-provider';

type Store = { slug: string; isTenantDomain: boolean; path: (href: string) => string };
const Context = createContext<Store>({ slug: COMMERCE_SLUG, isTenantDomain: false, path: href => href });
export function StorefrontProvider({ children, domainSlug }: { children: React.ReactNode; domainSlug: string | null }) {
  const params = useParams<{ slug?: string }>();
  const slug = domainSlug || params.slug || COMMERCE_SLUG;
  const value = useMemo(() => ({
    slug,
    isTenantDomain: Boolean(domainSlug),
    path: (href: string) => storePath(params.slug, href, Boolean(domainSlug)),
  }), [slug, params.slug, domainSlug]);
  return <Context.Provider value={value}><CommerceThemeProvider key={slug}><CustomerAuthProvider key={slug}><CartProvider key={slug}>{children}</CartProvider></CustomerAuthProvider></CommerceThemeProvider></Context.Provider>;
}
export function useStorefront() { return useContext(Context); }
