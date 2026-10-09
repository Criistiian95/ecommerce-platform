'use client';
import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useStorefront } from '../storefront-context';

export default function RecoveryForm({ customer = false }: { customer?: boolean }) {
  const store = useStorefront();
  const [slug, setSlug] = useState(customer || store.isTenantDomain ? store.slug : '');
  const [audience, setAudience] = useState<'customer' | 'admin'>(customer ? 'customer' : 'admin');
  const [token, setToken] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const search = new URLSearchParams(window.location.search);
    if (fragment.get('token')) {
      setToken(fragment.get('token') || '');
      setSlug(fragment.get('comercio') || '');
      setAudience(fragment.get('tipo') === 'customer' ? 'customer' : 'admin');
    } else if (search.get('comercio')) setSlug(search.get('comercio') || '');
    window.history.replaceState(null, '', window.location.pathname);
    setReady(true);
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') || '');
    const confirmPassword = String(form.get('confirmPassword') || '');
    if (token && ([...password].length < 15 || new TextEncoder().encode(password).length > 72 || password !== confirmPassword)) {
      setMessage('Usá al menos 15 caracteres y repetí la misma contraseña. Si usás muchos símbolos o emojis, elegí una frase más corta.'); return;
    }
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3003'}/auth/password/${token ? 'reset' : 'request'}`, {
        method: 'POST', cache: 'no-store', referrerPolicy: 'no-referrer',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commerceSlug: slug.trim().toLowerCase(), audience,
          ...(token ? { token, password, confirmPassword } : { email: form.get('email') }) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.message === 'string' ? data.message : 'No se pudo completar. Intentá nuevamente.');
      setMessage(data.message);
      if (token) { setDone(true); setToken(''); }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo conectar. Intentá nuevamente.'); }
    finally { setBusy(false); }
  }
  const login = audience === 'admin' ? '/login' : store.isTenantDomain ? '/cliente/login' : `/tienda/${encodeURIComponent(slug)}/cliente/login`;
  return <main className="login" style={{ maxWidth: 520, margin: '60px auto', padding: 24 }}>
    <h1>{done ? 'Contraseña actualizada' : token ? 'Elegí una contraseña nueva' : 'Recuperá tu contraseña'}</h1>
    {!done && <p>{token ? 'Usá una frase larga y exclusiva para esta cuenta. Al guardar, se cerrarán las sesiones anteriores.' : 'Te enviaremos un enlace para recuperar el acceso a tu cuenta.'}</p>}
    {ready && !done && <form onSubmit={submit}>
      {!token && <>
        {!customer && !store.isTenantDomain && <label className="field">Identificador del comercio
          <input name="commerceSlug" value={slug} onChange={e => setSlug(e.target.value)} required maxLength={120} autoCapitalize="none" placeholder="Ejemplo: comercio-demo" />
          <small>Es el identificador que aparece en el enlace de tu tienda.</small>
        </label>}
        <label className="field">Email de tu cuenta<input type="email" name="email" autoComplete="email" maxLength={190} required /></label>
      </>}
      {token && <>
        <label className="field">Nueva contraseña<input type="password" name="password" autoComplete="new-password" minLength={15} maxLength={72} required /></label>
        <label className="field">Repetí la contraseña<input type="password" name="confirmPassword" autoComplete="new-password" minLength={15} maxLength={72} required /></label>
        <small>Mínimo 15 caracteres. Podés pegar una contraseña de tu gestor.</small>
      </>}
      <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Procesando…' : token ? 'Guardar contraseña' : 'Enviar enlace'}</button>
    </form>}
    {message && <p role="status" aria-live="polite">{message}</p>}
    {token && <p><button type="button" className="btn" onClick={() => { setToken(''); setMessage(''); }}>Solicitar otro enlace</button></p>}
    <p><Link href={login}>Volver al inicio de sesión</Link></p>
  </main>;
}
