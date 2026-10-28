'use client';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { API_URL } from './storefront-types';
import { STOREFRONT_DOMAIN } from './tenant-host';
import { isPlatformVisit } from './platform-visit-path';

const SESSION_KEY = 'disenolys-platform-session';
const SESSION_TIMEOUT = 30 * 60_000;

export default function PlatformVisitTracker({ tenantDomain }: { tenantDomain: boolean }) {
  const path = usePathname();
  const lastPath = useRef<string | null>(null);
  useEffect(() => {
    if (!path || lastPath.current === path) return;
    lastPath.current = path;
    if (!isPlatformVisit(window.location.hostname, path, tenantDomain, STOREFRONT_DOMAIN) || window.self !== window.top ||
        /bot|crawler|spider|headless|preview|slurp/i.test(navigator.userAgent)) return;
    try {
      const now = Date.now();
      let session: { id?: string; last?: number } = {};
      try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}'); } catch { /* Start a new session. */ }
      if (!session.id || !/^[a-f0-9]{32}$/.test(session.id) || typeof session.last !== 'number' || now < session.last || now - session.last > SESSION_TIMEOUT) {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        session.id = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
      }
      session.last = now;
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      void fetch(`${API_URL}/platform/visit`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, sessionId: session.id }), keepalive: true }).catch(() => {});
    } catch { /* Analytics never blocks the page. */ }
  }, [path, tenantDomain]);
  return null;
}
