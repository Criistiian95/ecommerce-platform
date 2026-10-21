'use client';

import { Fragment, type ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN_LOGOUT_EVENT, ADMIN_TOKEN_KEY } from './session';

/** Hide cached admin views on logout, including other tabs on this origin. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState({ token: '', ready: false, revision: 0 });

  useEffect(() => {
    function synchronizeSession() {
      const token = window.localStorage.getItem(ADMIN_TOKEN_KEY) ?? '';
      setSession(previous => ({
        token, ready: true,
        revision: previous.revision + (previous.token === token ? 0 : 1),
      }));
      if (!token) router.replace('/login');
    }
    function onStorage(event: StorageEvent) {
      if (event.storageArea === window.localStorage && (event.key === ADMIN_TOKEN_KEY || event.key === null)) {
        synchronizeSession();
      }
    }
    function onLogout() {
      // The logout button owns navigation in this tab; just unmount private views here.
      setSession(previous => ({ token: '', ready: true, revision: previous.revision + 1 }));
    }
    synchronizeSession();
    window.addEventListener('storage', onStorage);
    window.addEventListener(ADMIN_LOGOUT_EVENT, onLogout);
    window.addEventListener('pageshow', synchronizeSession);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(ADMIN_LOGOUT_EVENT, onLogout);
      window.removeEventListener('pageshow', synchronizeSession);
    };
  }, [router]);

  if (!session.ready || !session.token) {
    return <main className="shell" role="status">{session.ready ? 'Volviendo al ingreso…' : 'Cargando panel…'}</main>;
  }
  return <Fragment key={session.revision}>{children}</Fragment>;
}
