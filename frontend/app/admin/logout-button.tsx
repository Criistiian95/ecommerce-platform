'use client';
import {useRouter} from 'next/navigation';
import {useState} from 'react';
import {API_URL} from '../storefront-types';
/** Log out locally even when the network is unavailable, then revoke the server session. */
export default function AdminLogoutButton(){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  async function logout(){
    if(busy)return;
    setBusy(true);
    const token=localStorage.getItem('ecommerce_token');
    // Stop using this token immediately, including in all other admin tabs on this origin.
    localStorage.removeItem('ecommerce_token');
    try{
      if(token) await fetch(`${API_URL}/auth/admin/logout`,{
        method:'POST',
        headers:{Authorization:`Bearer ${token}`},
        signal:AbortSignal.timeout(7000)
      });
    }catch{ /* local logout remains effective on this browser */ }
    router.replace('/login');
    router.refresh();
  }
  return <button type="button" className="admin-nav-link" onClick={logout} disabled={busy} aria-label="Cerrar sesión de administrador y cambiar de tienda" style={{font:'inherit',cursor:busy?'wait':'pointer'}}>{busy?'Saliendo…':'Cerrar sesión'}</button>;
}
