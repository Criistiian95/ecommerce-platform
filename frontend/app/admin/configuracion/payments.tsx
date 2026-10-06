'use client';
import { useEffect, useRef, useState } from 'react';
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3003';
type Status = { configured: boolean; connected: boolean; collectorId: string | null };
export default function Payments({ token }: { token: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const initialized = useRef(false);
  async function request(path = '', body?: object) {
    const response = await fetch(`${API}/admin/commerce/payments${path}`, {
      method: body ? 'POST' : 'GET', cache: 'no-store', referrerPolicy: 'no-referrer',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.message === 'string' ? data.message : 'No se pudo conectar Mercado Pago.');
    return data;
  }
  useEffect(() => {
    if (!token || initialized.current) return;
    initialized.current = true;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code'), state = params.get('state'), error = params.get('error');
    if (code || error) window.history.replaceState(null, '', window.location.pathname);
    setBusy(true);
    void (async () => {
      try {
        if (error) setMessage('No se autorizó la conexión. Podés volver a intentarlo.');
        if (code && state) {
          await request('/complete', { code, state });
          setMessage('Mercado Pago conectado. Las ventas se cobrarán en esta cuenta.');
        }
        setStatus(await request());
      } catch (e) { setMessage(e instanceof Error ? e.message : 'No se pudo cargar la conexión.'); }
      finally {
        try { setStatus(await request()); } catch { /* Keep the actionable error above. */ }
        setBusy(false);
      }
    })();
  }, [token]);
  async function connect() {
    setBusy(true); setMessage('');
    try { const data = await request('/connect', {}); window.location.assign(data.url); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'No se pudo conectar.'); setBusy(false); }
  }
  return <section className="card settings-card" aria-label="Cobros con Mercado Pago" style={{ marginBottom: 24 }}>
    <div className="settings-card-head"><div><span className="settings-kicker">COBROS</span><h2>Mercado Pago</h2></div></div>
    <p>Conectá la cuenta de tu comercio para recibir el dinero de tus ventas.</p>
    {status && <p><strong>{status.connected ? `Cuenta conectada · ${status.collectorId}` : 'Cuenta sin conectar'}</strong></p>}
    {status && !status.configured && <p>La conexión de cobros está pendiente de habilitación por el administrador de la plataforma.</p>}
    {status?.connected && <p>Si necesitás renovar el permiso, reconectá la misma cuenta.</p>}
    <button type="button" className="btn primary" disabled={busy || !status?.configured} onClick={connect}>
      {busy ? 'Procesando…' : status?.connected ? 'Reconectar Mercado Pago' : 'Conectar Mercado Pago'}
    </button>
    {message && <p role="status">{message}</p>}
  </section>;
}
