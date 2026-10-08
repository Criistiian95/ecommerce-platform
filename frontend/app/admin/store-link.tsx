'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { API_URL } from '../storefront-types';
export default function AdminStoreLink() {
  const [href, setHref] = useState('');
  useEffect(() => {
    const token = localStorage.getItem('ecommerce_token');
    if (!token) return;
    const controller = new AbortController();
    fetch(`${API_URL}/admin/commerce/settings`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal })
      .then(async r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => {
        const host = window.location.hostname.toLowerCase();
        const ownDomain = host === `${data.slug}.disenolys.store`;
        setHref(ownDomain ? '/' : `/tienda/${encodeURIComponent(data.slug)}`);
      }).catch(() => {});
    return () => controller.abort();
  }, []);
  return href ? <Link className="admin-store-link" href={href}>↗ Ver tienda</Link> : null;
}
