'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useStorefront } from './storefront-context';

export default function StoreAdminAccess() {
  const { isTenantDomain, slug } = useStorefront();
  const [href, setHref] = useState('/login');
  const [label, setLabel] = useState('Acceso para comercios');

  useEffect(() => {
    const signedIn = Boolean(localStorage.getItem('ecommerce_token'));
    // A session created on this subdomain is stored on this origin. Sending
    // that user to the central host would lose access to their local session.
    if (isTenantDomain && !signedIn) {
      const origin = (process.env.NEXT_PUBLIC_ADMIN_ORIGIN || 'https://ecommerce-platform-web.onrender.com').replace(/\/$/, '');
      setHref(`${origin}/admin/dashboard`);
      setLabel('Panel del comercio');
      return;
    }
    setHref(signedIn ? '/admin/dashboard' : '/login');
    setLabel(isTenantDomain ? 'Panel del comercio' : signedIn ? 'Ir al dashboard' : 'Acceso para comercios');
  }, [isTenantDomain, slug]);

  return <Link href={href}>{label}</Link>;
}
