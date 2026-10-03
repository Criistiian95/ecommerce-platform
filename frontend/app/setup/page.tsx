'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3003';

export default function SetupPage() {
  const router = useRouter();
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('Creando comercio y administrador...');

    const form = new FormData(event.currentTarget);
    const payload = {
      commerceName: form.get('commerceName'),
      commerceSlug: form.get('commerceSlug'),
      adminName: form.get('adminName'),
      email: form.get('email'),
      password: form.get('password'),
    };

    const response = await fetch(`${API}/auth/setup-initial-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      setMessage(data?.message ?? 'No se pudo crear el comercio.');
      return;
    }

    setMessage('Comercio creado. Redirigiendo al login...');
    setTimeout(() => router.push('/login'), 700);
  }

  return (
    <main className="login">
      <h1>Configuración inicial</h1>
      <p>Creá el primer comercio y su usuario administrador.</p>

      <form onSubmit={submit}>
        <label className="field">
          Nombre del comercio
          <input name="commerceName" defaultValue="Comercio Demo" required />
        </label>

        <label className="field">
          Identificador
          <input name="commerceSlug" defaultValue="comercio-demo" required />
        </label>

        <label className="field">
          Nombre del administrador
          <input name="adminName" defaultValue="Admin Demo" required />
        </label>

        <label className="field">
          Email
          <input name="email" type="email" defaultValue="admin@comerciodemo.com" required />
        </label>

        <label className="field">
          Contraseña
          <input name="password" type="password" minLength={10} required />
        </label>

        <button className="btn primary" type="submit">Crear comercio</button>
      </form>

      {message && <p>{message}</p>}
    </main>
  );
}
