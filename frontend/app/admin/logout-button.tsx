'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { API_URL } from '../storefront-types';
import { logoutAdminSession } from './session';

export default function AdminLogoutButton() {
  const router = useRouter();
  const started = useRef(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { router.prefetch('/login'); }, [router]);

  function logout() {
    if (started.current) return;
    started.current = true;
    setBusy(true);
    logoutAdminSession(API_URL, () => router.replace('/login'));
  }

  return (
    <button
      type="button"
      className="admin-nav-link admin-logout-button"
      onClick={logout}
      disabled={busy}
      aria-busy={busy}
      aria-label="Cerrar sesión de administrador y cambiar de tienda"
    >
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 5H5v14h4M14 8l4 4-4 4M8 12h10" />
      </svg>
      {busy ? 'Saliendo…' : 'Cerrar sesión'}
    </button>
  );
}
