'use client';

import { useStorefront } from '../../storefront-context';
import { customerDestination } from '../../storefront-routing';
import Link from '../../store-link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCustomerAuth } from '../../customer-auth-context';
import styles from '../customer.module.css';

export default function CustomerLoginPage() {
  const { login } = useCustomerAuth();
  const router = useRouter();
  const { path } = useStorefront();
  const [message,setMessage] = useState('');
  const [saving,setSaving] = useState(false);

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setMessage('');

    const result = await login(
      String(form.get('email') ?? ''),
      String(form.get('password') ?? ''),
    );

    setSaving(false);

    if (!result.ok) {
      setMessage(result.message ?? 'No se pudo iniciar sesión.');
      return;
    }

    const next = new URLSearchParams(window.location.search).get('next');
    router.push(path(customerDestination(next)));
  }

  return (
    <main className={styles.root}>
      <div className={styles.shell}>
        <Link href="/tienda" className={styles.back}>← Volver a la tienda</Link>
        <section className={styles.authCard}>
          <span className={styles.eyebrow}>MI CUENTA</span>
          <h1>Ingresá a tu cuenta</h1>
          <p>Consultá tus pedidos y completá más rápido tus próximas compras.</p>

          {message && <div className={styles.alert}>{message}</div>}

          <form onSubmit={submit} className={styles.form}>
            <label>
              Email
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              Contraseña
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            <button className="btn primary" type="submit" disabled={saving}>
              {saving ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>

          <div className={styles.authFooter}>
            <span>¿Todavía no tenés cuenta?</span>
            <Link href="/cliente/registro">Crear cuenta</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
