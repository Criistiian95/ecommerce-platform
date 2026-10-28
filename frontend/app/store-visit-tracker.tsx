'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { API_URL } from './storefront-types';
import { isStoreVisitPath } from './store-visit-path';

export default function StoreVisitTracker({ slug, tenantDomain }: { slug: string; tenantDomain: boolean }) {
  const path = usePathname();
  useEffect(() => {
    if (!path || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug) || !isStoreVisitPath(path, slug, tenantDomain) || window.self !== window.top) return;
    if (/bot|crawler|spider|headless|preview|slurp/i.test(navigator.userAgent)) return;
    try {
      const key = `disenolys-visit:${slug}`;
      let visitorId = localStorage.getItem(key);
      if (!visitorId || !/^[a-f0-9]{32}$/.test(visitorId)) {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        visitorId = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
        localStorage.setItem(key, visitorId);
      }
      void fetch(`${API_URL}/catalog/store/${encodeURIComponent(slug)}/visit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId }), keepalive: true,
      }).catch(() => {});
    } catch { /* Browsing and shopping must work even if storage is unavailable. */ }
  }, [path, slug, tenantDomain]);
  return null;
}
