'use client';
import Link from 'next/link';
import { useMerchantPlan } from './use-merchant-plan';
import { paymentOffer, planDate, planPresentation } from './plan-data';
import styles from './plan.module.css';

export default function PlanSummary() {
  const { data, loading, error } = useMerchantPlan();
  const info = data ? planPresentation(data) : null;
  const offer = data ? paymentOffer(data) : null;
  return (
    <section className={styles.summary} aria-label="Resumen de mi plan">
      <div className={styles.summaryIcon} aria-hidden="true">▤</div>
      <div className={styles.summaryCopy}>
        <strong>Mi plan</strong>
        <span>{loading ? 'Consultando tu suscripción…' : error ? 'No pudimos consultar el estado del plan.' : info?.label}</span>
        {data?.subscription?.paidThrough && <small>Período abonado hasta el {planDate(data.subscription.paidThrough)}</small>}
      </div>
      {info && <span className={`${styles.badge} ${styles[info.tone]}`}>{data?.commerce.active ? 'Tienda activa' : 'Tienda inactiva'}</span>}
      <Link className={styles.summaryLink} href={offer ? '/admin/plan#pagar-cuota' : '/admin/plan'}>{offer ? `Pagar cuota · $${offer.amountArs.toLocaleString('es-AR')}` : 'Ver mi plan'} <span aria-hidden="true">→</span></Link>
    </section>
  );
}
