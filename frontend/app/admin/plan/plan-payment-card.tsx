'use client';
import { useRef, useState } from 'react';
import { API_URL } from '../../storefront-types';
import { ADMIN_TOKEN_KEY } from '../session';
import { MerchantPlan, paymentOffer, validatedCheckoutUrl } from './plan-data';
import styles from './plan.module.css';

export default function PlanPaymentCard({ data, onUpdated }: { data: MerchantPlan; onUpdated: () => void }) {
  const offer = paymentOffer(data);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const submitting = useRef(false);

  async function request(action: 'checkout' | 'sync') {
    if (submitting.current || (action === 'checkout' && (!offer || !accepted))) return;
    submitting.current = true;
    setBusy(action); setError(''); setMessage('');
    let navigating = false;
    try {
      const token = localStorage.getItem(ADMIN_TOKEN_KEY);
      if (!token) throw new Error('Volvé a iniciar sesión para continuar.');
      const response = await fetch(`${API_URL}/admin/plan/${action}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(45000),
        body: JSON.stringify(action === 'checkout' ? { acceptedMonthly: accepted, amountArs: offer!.amountArs } : {}),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof result?.message === 'string' ? result.message : 'No pudimos completar la consulta. Reintentá en unos instantes.');
      if (action === 'checkout' && result?.checkoutUrl) {
        const url = validatedCheckoutUrl(result.checkoutUrl);
        if (!url) throw new Error('No recibimos un enlace válido de Mercado Pago. Reintentá en unos instantes.');
        window.location.assign(url);
        navigating = true;
        return;
      }
      setMessage(action === 'sync' ? (result?.processed ? 'Se acreditó un pago. El estado de tu plan se está actualizando.' : 'Consulta completada. Revisá el estado y la fecha del último pago: todavía no recibimos una acreditación nueva.') : (result?.message || 'Actualizamos el estado de tu suscripción.'));
      onUpdated();
    } catch (cause) {
      setError(cause instanceof Error && cause.name !== 'TimeoutError' && cause.name !== 'TypeError' ? cause.message : 'No pudimos confirmar la respuesta. Podés reintentar; se recuperará la misma suscripción.');
    } finally {
      if (!navigating) { submitting.current = false; setBusy(''); }
    }
  }

  return <section id="pagar-cuota" className={styles.paymentCard} aria-label="Pago de la cuota" aria-busy={!!busy}>
    {offer ? <>
      <div><span className={styles.kicker}>{offer.firstPayment ? 'PRIMERA CUOTA' : 'CUOTA SIN ACREDITAR'}</span><h2>{data.trial ? 'Activar mi abono' : 'Pagar cuota'}</h2>
        <div className={styles.price}>${offer.amountArs.toLocaleString('es-AR')}<span>ARS por mes</span></div>
        {data.trial && !data.trial.expired && <p>Podés seguir usando tu prueba hasta su vencimiento. Si activás el abono ahora, el período pago empieza al acreditarse la primera cuota.</p>}
        <p>Continuá en Mercado Pago para elegir el medio de pago y confirmar tu suscripción mensual.</p>
        {offer.firstPayment && <small>Este importe corresponde al inicio del abono. No incluye deuda por meses anteriores.</small>}
      </div>
      <div className={styles.paymentControls}>
        <label className={styles.consent}><input type="checkbox" checked={accepted} disabled={!!busy} onChange={event => setAccepted(event.target.checked)} /><span>Entiendo que el abono es de ${offer.amountArs.toLocaleString('es-AR')} ARS por mes y se renueva automáticamente.</span></label>
        <button type="button" className="btn primary" disabled={!accepted || !!busy} onClick={() => void request('checkout')}>{busy === 'checkout' ? 'Preparando pago…' : `Pagar cuota · $${offer.amountArs.toLocaleString('es-AR')}`}</button>
        <small>Confirmás el pago en Mercado Pago. La cuota se registra como pagada cuando se acredita.</small>
      </div>
    </> : <div><h2>Confirmación de tus pagos</h2><p>{data.subscription ? 'Si ya pagaste, consultá la acreditación sin salir del panel. Si un débito fue rechazado, revisá el medio de pago desde Suscripciones en tu cuenta de Mercado Pago.' : 'El pago del abono no está disponible por el momento.'}</p></div>}
    {data.subscription && <div className={styles.paymentVerification}><button type="button" className="btn" disabled={!!busy} onClick={() => void request('sync')}>{busy === 'sync' ? 'Verificando…' : 'Ya pagué / Verificar pago'}</button><small>Se consultan los pagos existentes. Esta verificación no genera un cobro.</small></div>}
    {error && <p className={styles.paymentError} role="alert">{error}</p>}
    {message && <p className={styles.paymentMessage} role="status">{message}</p>}
  </section>;
}
