'use client';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { API_URL } from '../storefront-types';
import styles from './statistics.module.css';

type Data = { visits: number; sessions: number; registrationViews: number; storesCreated: number };
const TOKEN_KEY = 'disenolys-owner-statistics';
const periods = [{ value: '7', label: '7 días' }, { value: '30', label: '30 días' },
  { value: '90', label: '90 días' }, { value: 'all', label: 'Todo' }];

export default function StatisticsPage() {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState('');
  const [period, setPeriod] = useState('30');
  const [data, setData] = useState<Data | null>(null);
  const [requested, setRequested] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  useEffect(() => { try { setToken(sessionStorage.getItem(TOKEN_KEY) || ''); } catch {} setReady(true); }, []);
  const load = useCallback(async (currentToken: string, selectedPeriod: string) => {
    const request = ++requestId.current;
    setData(null); setError('');
    try {
      const response = await fetch(`${API_URL}/platform/statistics?period=${selectedPeriod}`, {
        headers: { Authorization: `Bearer ${currentToken}` }, cache: 'no-store',
      });
      if (request !== requestId.current) return;
      if (response.status === 401) { try { sessionStorage.removeItem(TOKEN_KEY); } catch {} setToken(''); setError('Tu acceso venció. Solicitá un código nuevo.'); return; }
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (request === requestId.current) setData(result);
    } catch { if (request === requestId.current) setError('No pudimos cargar las estadísticas. Intentá nuevamente.'); }
  }, []);
  useEffect(() => { if (token) void load(token, period); }, [token, period, load]);

  async function requestCode() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`${API_URL}/platform/owner/code`, { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || 'No pudimos enviar el código.');
      setRequested(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'No pudimos enviar el código.'); }
    finally { setBusy(false); }
  }
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch(`${API_URL}/platform/owner/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.token) throw new Error(body.message || 'El código no es válido o venció.');
      try { sessionStorage.setItem(TOKEN_KEY, body.token); } catch {}
      setToken(body.token); setCode('');
    } catch (e) { setError(e instanceof Error ? e.message : 'No pudimos verificar el código.'); }
    finally { setBusy(false); }
  }
  function logout() { requestId.current++; try { sessionStorage.removeItem(TOKEN_KEY); } catch {} setToken(''); setData(null); setRequested(false); }

  return <main className={styles.page}>
    <header className={styles.top}><Link href="/" className={styles.brand}>DISEÑOS <span>L&amp;S</span></Link><span>Panel privado</span>{token && <button onClick={logout}>Cerrar sesión</button>}</header>
    <div className={styles.content}>
      <div className={styles.heading}><span className={styles.eyebrow}>TU NEGOCIO EN NÚMEROS</span><h1>Estadísticas de Diseños L&amp;S</h1><p>Conocé cómo llegan las personas a tu página y cuántas crean una tienda.</p></div>
      {!ready ? <p className={styles.muted}>Cargando…</p> : !token ?
        <section className={styles.login}><div className={styles.lock} aria-hidden="true">✦</div><h2>Un espacio solo para vos</h2><p>Para ingresar, solicitá un código al correo de administración de Diseños L&amp;S.</p>
          {!requested ? <button className={styles.primary} disabled={busy} onClick={() => void requestCode()}>{busy ? 'Enviando…' : 'Enviar código de acceso'}</button> :
            <form onSubmit={verify}><label htmlFor="owner-code">Código de 8 dígitos</label><input id="owner-code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" required placeholder="00000000" /><p>Revisá tu correo y también la carpeta de spam. El código vence en 10 minutos.</p><button className={styles.primary} disabled={busy} type="submit">{busy ? 'Verificando…' : 'Ver estadísticas'}</button><button type="button" className={styles.textButton} disabled={busy} onClick={() => void requestCode()}>Enviar otro código</button></form>}
          {error && <p className={styles.error} role="alert">{error}</p>}
        </section> : <>
          <div className={styles.toolbar}><div><h2>Resumen general</h2><p>Actividad de la página de Diseños L&amp;S</p></div><div className={styles.periods} aria-label="Elegir período">{periods.map(p => <button key={p.value} className={period === p.value ? styles.selected : ''} aria-pressed={period === p.value} onClick={() => setPeriod(p.value)}>{p.label}</button>)}</div></div>
          {error && <div className={styles.error} role="alert">{error} <button className={styles.textButton} onClick={() => void load(token, period)}>Reintentar</button></div>}
          <section className={styles.grid} aria-label="Indicadores">
            {[
              ['01', 'Visitas totales', data?.visits, 'Páginas vistas en Diseños L&S'],
              ['02', 'Sesiones estimadas', data?.sessions, 'Visitas con hasta 30 min de inactividad'],
              ['03', 'Visitas al registro', data?.registrationViews, 'Vistas de la página de registro'],
              ['04', 'Tiendas creadas', data?.storesCreated, 'Altas hechas desde la página'],
            ].map(([number, label, value, detail]) => <article className={styles.metric} key={String(number)}><span className={styles.metricNumber}>{number}</span><h3>{label}</h3><strong>{typeof value === 'number' ? value.toLocaleString('es-AR') : '—'}</strong><p>{detail}</p></article>)}
          </section>
          <div className={styles.note}><strong>Cómo leer estos datos</strong><p>Las visitas cuentan las páginas abiertas, incluidas las recargas. Una sesión reúne la actividad de un navegador hasta 30 minutos de inactividad. Son estimaciones: pueden incluir tus propias visitas. Las visitas comienzan a contarse desde la activación; las altas de tiendas incluyen registros anteriores.</p></div>
        </>}
    </div>
  </main>;
}
