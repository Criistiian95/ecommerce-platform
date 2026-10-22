'use client';

import { FormEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStorefront } from '../storefront-context';
import Link from 'next/link';

export default function LoginPage() {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const router = useRouter();
  const { slug, isTenantDomain } = useStorefront();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    let navigating = false;

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3003'}/auth/login`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(15000),
          body: JSON.stringify({
            email: form.get('email'),
            password: form.get('password'),
            commerceSlug: isTenantDomain ? slug : String(form.get('commerceSlug') || '').trim(),
          }),
        },
      );

      if (!response.ok) {
        setMessage('No se pudo iniciar sesión.');
        return;
      }

      const data = await response.json();
      if (data.billingRequired) {
        if (data.checkoutUrl) {
          window.location.assign(data.checkoutUrl);
          navigating = true;
          return;
        }
        setMessage('Tu tienda está pendiente de pago. Reintentá en unos minutos.');
        return;
      }
      if (!data.token) {
        setMessage('No se pudo abrir una sesión válida.');
        return;
      }
      if (data.user?.role === 'admin' || data.user?.role === 'superadmin') {
        localStorage.setItem('ecommerce_token', data.token);
        router.replace('/admin/dashboard');
        navigating = true;
        return;
      }

      setMessage('Tu usuario no tiene acceso al panel administrador.');
    } catch {
      setMessage('No pudimos conectar con el servidor. Intentá nuevamente.');
    } finally {
      if (!navigating) {
        submitting.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <main className="login merchant-login">
      <h1>Administrar tienda</h1>
      <p>Acceso para administradores del comercio.</p>
      <form onSubmit={submit} aria-busy={busy}>
        {!isTenantDomain && <label className="field">Identificador de tu tienda<input name="commerceSlug" placeholder="cfz-carpinteria"/><small>Completalo si administrás más de una tienda con el mismo email.</small></label>}
        <label className="field">
          Email
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label className="field">
          Contraseña
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button className="btn primary merchant-login-submit" type="submit" disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar'}</button>
      </form>
      <p><Link href="/registro">Crear mi tienda</Link></p>
      <p><Link href="/recuperar">Olvidé mi contraseña</Link></p>
      {message && <p className="merchant-login-message" role="alert">{message}</p>}
    </main>
  );
}
