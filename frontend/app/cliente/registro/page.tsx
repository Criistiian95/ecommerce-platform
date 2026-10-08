'use client';

import { useStorefront } from '../../storefront-context';
import { customerDestination } from '../../storefront-routing';
import Link from '../../store-link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCustomerAuth } from '../../customer-auth-context';
import styles from '../customer.module.css';

export default function CustomerRegisterPage() {
  const { register } = useCustomerAuth();
  const router = useRouter();
  const { path } = useStorefront();
  const [message,setMessage] = useState('');
  const [saving,setSaving] = useState(false);

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    const confirmation = String(form.get('passwordConfirmation') ?? '');

    if (password !== confirmation) {
      setMessage('Las contraseñas no coinciden.');
      return;
    }

    setSaving(true);
    setMessage('');

    const result = await register({
      name: String(form.get('name') ?? ''),
      email: String(form.get('email') ?? ''),
      password,
      phone: String(form.get('phone') ?? ''),
      defaultAddress: String(form.get('defaultAddress') ?? ''),
    });

    setSaving(false);

    if (!result.ok) {
      setMessage(result.message ?? 'No se pudo crear la cuenta.');
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
          <span className={styles.eyebrow}>CREAR CUENTA</span>
          <h1>Registrate</h1>
          <p>Guardá tus datos y accedé al historial de tus compras.</p>

          {message && <div className={styles.alert}>{message}</div>}

          <form onSubmit={submit} className={styles.form}>
            <label>
              Nombre y apellido
              <input name="name" autoComplete="name" required />
            </label>
            <label>
              Email
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              Teléfono
              <input name="phone" type="tel" autoComplete="tel" />
            </label>
            <label>
              Dirección habitual (opcional)
              <input name="defaultAddress" autoComplete="street-address" placeholder="Calle, número, localidad" />
            </label>
            <div className={styles.twoCols}>
              <label>
                Contraseña
                <input name="password" type="password" minLength={8} autoComplete="new-password" required />
              </label>
              <label>
                Repetir contraseña
                <input name="passwordConfirmation" type="password" minLength={8} autoComplete="new-password" required />
              </label>
            </div>
            <small className={styles.help}>Mínimo 8 caracteres.</small>
            <button className="btn primary" type="submit" disabled={saving}>
              {saving ? 'Creando cuenta...' : 'Crear cuenta'}
            </button>
          </form>

          <div className={styles.authFooter}>
            <span>¿Ya tenés cuenta?</span>
            <Link href="/cliente/login">Ingresar</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
