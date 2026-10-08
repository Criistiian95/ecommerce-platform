'use client';
import { createContext, useContext, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { storePath } from './storefront-routing';
import { COMMERCE_SLUG } from './storefront-config';
import { CartProvider } from './cart-context';
import { CustomerAuthProvider } from './customer-auth-context';
import { CommerceThemeProvider } from './commerce-theme-provider';

type Store = { slug: string; path: (href: string) => string };
const Context = createContext<Store>({ slug: COMMERCE_SLUG, path: href => href });
export function StorefrontProvider({ children }: { children: React.ReactNode }) {
  const params = useParams<{ slug?: string }>();
  const slug = params.slug ?? COMMERCE_SLUG;
  const value = useMemo(() => ({ slug, path: (href: string) => storePath(params.slug, href) }), [slug, params.slug]);
  return <Context.Provider value={value}><CommerceThemeProvider key={slug}><CustomerAuthProvider><CartProvider>{children}</CartProvider></CustomerAuthProvider></CommerceThemeProvider></Context.Provider>;
}
export function useStorefront() { return useContext(Context); }
