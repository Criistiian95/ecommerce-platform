'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [message, setMessage] = useState('');
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3003'}/auth/login`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.get('email'),
          password: form.get('password'),
        }),
      },
    );

    if (!response.ok) {
      setMessage('No se pudo iniciar sesión.');
      return;
    }

    const data = await response.json();
    localStorage.setItem('ecommerce_token', data.token);

    if (data.user.role === 'admin' || data.user.role === 'superadmin') {
      router.push('/admin');
      return;
    }

    setMessage('Tu usuario no tiene acceso al panel administrador.');
  }

  return (
    <main className="login">
      <h1>Administrar tienda</h1>
      <p>Acceso para administradores del comercio.</p>
      <form onSubmit={submit}>
        <label className="field">
          Email
          <input name="email" type="email" required />
        </label>
        <label className="field">
          Contraseña
          <input name="password" type="password" required />
        </label>
        <button className="btn primary" type="submit">Ingresar</button>
      </form>
      {message && <p>{message}</p>}
    </main>
  );
}
