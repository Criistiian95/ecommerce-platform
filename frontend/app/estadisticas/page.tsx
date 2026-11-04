'use client';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { API_URL } from '../storefront-types';
import styles from './statistics.module.css';

type IpData = { currentIp: string | null; currentExcluded: boolean; entries: {ip: string; label: string; createdAt: string}[] };
type Data = { visits: number; sessions: number; registrationViews: number; storesCreated: number; filteredSince?: string | null; ipExcluded?: boolean };
const TOKEN_KEY = 'disenolys-owner-statistics';
const periods = [{ value: '7', label: '7 días' }, { value: '30', label: '30 días' },
  { value: '90', label: '90 días' }, { value: 'all', label: 'Todo' }];

export default function StatisticsPage() {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState('');
  const [period, setPeriod] = useState('30');
  const [ips, setIps] = useState<IpData | null>(null);
  const [ip, setIp] = useState('');
  const [ipLabel, setIpLabel] = useState('');
  const [ipNotice, setIpNotice] = useState('');
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
  const loadIps = useCallback(async (currentToken: string) => {
    const res = await fetch(`${API_URL}/platform/owner/excluded-ips`, { headers: { Authorization: `Bearer ${currentToken}` }, cache: 'no-store' });
    if (!res.ok) throw new Error('No se pudieron consultar las IP excluidas.');
    setIps(await res.json());
  }, []);
  useEffect(() => { if (token) { void load(token, period); void loadIps(token).catch(() => setError('No pudimos cargar las IP excluidas.')); } }, [token, period, load, loadIps]);

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
  async function saveIp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!token || busy) return;
    setBusy(true); setError(''); setIpNotice('');
    try {
      const key = 'disenolys-platform-browser-id';
      let browserId = localStorage.getItem(key) || '';
      if (!/^[a-f0-9]{32}$/.test(browserId)) {
        const bytes = new Uint8Array(16); crypto.getRandomValues(bytes);
        browserId = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
        localStorage.setItem(key, browserId);
      }
      const response = await fetch(`${API_URL}/platform/owner/excluded-ips`, {
        method: 'POST', headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
        body: JSON.stringify({ip: ip.trim(), label: ipLabel.trim(), browserId})
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || 'No se pudo excluir la IP.');
      await Promise.all([loadIps(token), load(token, period)]);
      setIp(''); setIpLabel(''); setIpNotice('IP guardada. Las próximas visitas desde esa conexión no se contarán.');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo excluir la IP.'); }
    finally { setBusy(false); }
  }
  async function removeIp(address: string) {
    if (!token || busy || !window.confirm('¿Dejar de excluir la IP ' + address + '?')) return;
    setBusy(true); setError(''); setIpNotice('');
    try {
      const response = await fetch(`${API_URL}/platform/owner/excluded-ips`, {
        method: 'DELETE', headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
        body: JSON.stringify({ip: address})
      });
      if (!response.ok) throw new Error('No se pudo quitar la IP.');
      await loadIps(token); setIpNotice('IP quitada de la lista.');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo quitar la IP.'); }
    finally { setBusy(false); }
  }
  function logout() { requestId.current++; try { sessionStorage.removeItem(TOKEN_KEY); } catch {} setToken(''); setData(null); setIps(null); setRequested(false); }

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
          <div className={styles.note}>
            <strong>Excluir mis visitas por IP exacta</strong>
            <p>{ips ? (ips.currentIp ? `IP pública detectada en esta conexión: ${ips.currentIp}${ips.currentExcluded ? ' (en la lista).' : ' (todavía no agregada a la lista).'}` : 'No pudimos identificar de forma segura la IP de esta conexión.') : 'Consultando las IP excluidas…'}</p>
            {ips?.currentIp && !ips.currentExcluded && <button type="button" onClick={() => setIp(ips.currentIp || '')}>Usar la IP de esta conexión</button>}
            <form onSubmit={saveIp}>
              <p><label>IP pública completa <input value={ip} onChange={e => setIp(e.target.value)} placeholder="Ej.: 8.8.8.8" required maxLength={45} /></label></p>
              <p><label>Nombre para identificarla <input value={ipLabel} onChange={e => setIpLabel(e.target.value)} placeholder="Ej.: Wi-Fi de casa" required maxLength={80} /></label></p>
              <button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Agregar IP a la exclusión'}</button>
            </form>
            {ipNotice && <p role="status">{ipNotice}</p>}
            <p>IP excluidas:</p>
            {ips?.entries.length ? <ul>{ips.entries.map(entry => <li key={entry.ip}>{entry.label}: <strong>{entry.ip}</strong> <button type="button" disabled={busy} onClick={() => void removeIp(entry.ip)}>Quitar</button></li>)}</ul> : <p>Todavía no hay IP agregadas en esta lista.</p>}
            <p>Solo se excluye la IP completa indicada; cualquier otra persona en la misma conexión también quedará excluida. Si tu proveedor cambia la IP o usás datos móviles, verificá la nueva dirección y agregala. Las IP que agregues quedan guardadas para poder verlas y quitarlas en este panel privado. Al activar por primera vez la exclusión se inicia una nueva referencia para las visitas; los datos históricos no se borran. Las visitas ya registradas no se pueden identificar individualmente.</p>
            {data?.filteredSince && <p>Filtro anterior activo desde {new Date(data.filteredSince).toLocaleString('es-AR')}; se conserva su configuración.</p>}
          </div>
          <div className={styles.note}><strong>Cómo leer estos datos</strong><p>Las visitas cuentan las páginas abiertas, incluidas las recargas. Una sesión reúne la actividad de un navegador hasta 30 minutos de inactividad. Son estimaciones: antes de activar la exclusión pueden incluir tus visitas; después se excluyen las IP guardadas y se conserva el filtro anterior si estaba activo. Las IP compartidas pueden ocultar otras visitas. Las visitas comienzan a contarse desde la activación; las altas de tiendas incluyen registros anteriores.</p></div>
        </>}
    </div>
  </main>;
}
