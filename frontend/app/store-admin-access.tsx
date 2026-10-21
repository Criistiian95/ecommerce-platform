'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useStorefront } from './storefront-context';

export default function StoreAdminAccess() {
  const { isTenantDomain, slug } = useStorefront();
  const [href, setHref] = useState('/login');
  const [label, setLabel] = useState('Acceso para comercios');

  useEffect(() => {
    if (isTenantDomain) {
      const origin = (process.env.NEXT_PUBLIC_ADMIN_ORIGIN || 'https://ecommerce-platform-web.onrender.com').replace(/\/$/, '');
      setHref(`${origin}/admin/dashboard`);
      setLabel('Panel del comercio');
      return;
    }
    const signedIn = Boolean(localStorage.getItem('ecommerce_token'));
    setHref(signedIn ? '/admin/dashboard' : '/login');
    setLabel(signedIn ? 'Ir al dashboard' : 'Acceso para comercios');
  }, [isTenantDomain, slug]);

  return <Link href={href}>{label}</Link>;
}
