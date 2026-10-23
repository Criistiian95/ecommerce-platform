'use client';
import Link from 'next/link';
import { useState } from 'react';
import AdminLogoutButton from '../logout-button';
import AdminStoreLink from '../store-link';
import { platformWhatsAppUrl } from '../../platform-whatsapp';
import { planDate, planPresentation } from './plan-data';
import { useMerchantPlan } from './use-merchant-plan';
import styles from './plan.module.css';

const money = (value: number) => value.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });

export default function MerchantPlanPage() {
  const [page, setPage] = useState(1);
  const { data, loading, error, unauthorized, refresh } = useMerchantPlan(page);
  const info = data ? planPresentation(data) : null;
  const sub = data?.subscription;
  const whatsapp = platformWhatsAppUrl();
  return (
    <main className={`${styles.root} shell`}>
      <header className="topbar">
        <div><div className="brand">Panel del comercio</div><small>Tu suscripción a Diseñolys</small></div>
        <nav className="admin-nav" aria-label="Navegación del panel">
          <AdminLogoutButton />
          <Link className="admin-nav-link" href="/admin/dashboard">Dashboard</Link>
          <Link className="admin-nav-link" href="/admin">Productos</Link>
          <Link className="admin-nav-link" href="/admin/pedidos">Pedidos</Link>
          <Link className="admin-nav-link" href="/admin/clientes">Clientes</Link>
          <Link className="admin-nav-link active" href="/admin/plan" aria-current="page">Mi plan</Link>
          <Link className="admin-nav-link" href="/admin/configuracion">Configuración</Link>
          <Link className="admin-nav-link" href="/admin/personalizar">Personalizar mi tienda</Link>
          <AdminStoreLink />
        </nav>
      </header>

      <div className={styles.heading}>
        <div><span className={styles.kicker}>SUSCRIPCIÓN Y PAGOS</span><h1>Mi plan</h1><p>Revisá tu abono, el período vigente y los pagos acreditados.</p></div>
        <button type="button" className="btn" onClick={refresh} disabled={loading} aria-busy={loading}>{loading ? 'Actualizando…' : 'Actualizar información'}</button>
      </div>

      {error && <div className={styles.error} role="alert"><p>{error}</p>{unauthorized ? <Link href="/login" className="btn">Volver a ingresar</Link> : <button className="btn" onClick={refresh}>Reintentar</button>}</div>}
      {loading && <div className={styles.loading} role="status">Consultando el estado y los pagos de tu tienda…</div>}

      {data && info && <>
        <section className={styles.overview} aria-label="Estado del plan">
          <div className={styles.planCard}>
            <div className={styles.cardTop}><span className={styles.kicker}>DISEÑOLYS · TIENDA ONLINE</span><span className={`${styles.badge} ${styles[info.tone]}`}>{info.label}</span></div>
            <h2>{data.commerce.name}</h2>
            {sub ? <div className={styles.price}>{money(sub.amountArs)}<span>ARS por mes</span></div> : <div className={styles.noPlan}>Sin abono automático asociado</div>}
            <p>{info.message}</p>
            <div className={styles.storeState}><span className={`${styles.dot} ${data.commerce.active ? styles.activeDot : styles.inactiveDot}`} /><strong>{data.commerce.active ? 'Tu tienda está activa' : 'Tu tienda está inactiva'}</strong></div>
            {!data.billingEnabled && sub && <p className={styles.note}>La creación de nuevas suscripciones está deshabilitada por el momento. Contactanos si necesitás continuar un pago.</p>}
          </div>
          <div className={styles.dates}>
            <article className={styles.dateCard}><span>Período abonado hasta</span><strong>{sub?.paidThrough ? planDate(sub.paidThrough, true) : 'Sin vencimiento registrado'}</strong><small>{sub?.paidThrough && info.daysLeft !== null ? (info.daysLeft === 0 ? 'El período abonado finalizó' : `Quedan aproximadamente ${info.daysLeft} día${info.daysLeft === 1 ? '' : 's'}`) : 'Se informa después de acreditar un pago.'}</small></article>
            <article className={styles.dateCard}><span>Último pago acreditado</span><strong>{data.lastPayment ? planDate(data.lastPayment.approvedAt, true) : 'Sin pagos registrados'}</strong><small>{data.lastPayment ? `Referencia Mercado Pago: ${data.lastPayment.paymentReference}` : 'Acá verás los cobros confirmados de tu suscripción.'}</small></article>
          </div>
        </section>

        <section className={styles.helpCard} aria-label="Gestión del abono">
          <div><h2>Tu próxima renovación</h2><p>{sub?.paidThrough ? 'La fecha de fin del período indica hasta cuándo tenés cobertura abonada. El próximo débito depende del calendario de Mercado Pago; no se considera pagado hasta su acreditación.' : 'La primera acreditación definirá el período abonado. Si necesitás revisar tu situación o la forma de pago, escribinos.'}</p><small>Los pagos de las ventas de tu comercio se consultan en Pedidos. Este módulo muestra únicamente el abono de Diseñolys.</small></div>
          <div className={styles.helpActions}>
            {sub?.checkoutUrl && <a className="btn primary" href={sub.checkoutUrl} rel="noopener noreferrer" target="_blank">Continuar pago en Mercado Pago ↗</a>}
            {whatsapp ? <a className={styles.whatsapp} href={whatsapp} target="_blank" rel="noopener noreferrer">Consultar por WhatsApp ↗</a> : <Link className="btn" href="/contacto">Contactar a Diseñolys</Link>}
          </div>
        </section>

        <section className={styles.history} aria-label="Historial de pagos">
          <div className={styles.historyHead}><div><span className={styles.kicker}>TU ACTIVIDAD</span><h2>Pagos acreditados</h2></div><span>{data.pagination.total} {data.pagination.total === 1 ? 'pago registrado' : 'pagos registrados'}</span></div>
          {data.payments.length ? <div className={styles.tableWrap}><table><thead><tr><th>Fecha de acreditación</th><th>Referencia Mercado Pago</th><th>Estado</th></tr></thead><tbody>{data.payments.map(payment => <tr key={payment.id}><td>{planDate(payment.approvedAt, true)}</td><td className={styles.reference}>{payment.paymentReference}</td><td><span className={`${styles.badge} ${styles.success}`}>Acreditado</span></td></tr>)}</tbody></table></div> : <div className={styles.empty}>{data.pagination.total ? 'No hay pagos en esta página.' : 'Todavía no hay pagos de suscripción acreditados para esta tienda.'}</div>}
          <div className={styles.pagination}><span>Página {page} de {Math.max(1, Math.ceil(data.pagination.total / data.pagination.pageSize))}</span><div><button className="btn" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>Anterior</button><button className="btn" disabled={!data.pagination.hasMore || loading} onClick={() => setPage(value => value + 1)}>Siguiente</button></div></div>
          <p className={styles.historyNote}>Se muestran los pagos acreditados que recibió el sistema. Los intentos pendientes o rechazados no figuran como pagos realizados.</p>
        </section>
        <p className={styles.updated}>Información consultada el {planDate(data.checkedAt, true)} · Horario de Argentina.</p>
      </>}
    </main>
  );
}
