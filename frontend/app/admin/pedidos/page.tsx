'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import styles from './orders.module.css';

type OrderItem = {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

type Order = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryMethod: 'pickup' | 'shipping';
  address?: string | null;
  notes?: string | null;
  subtotal: number;
  total: number;
  paidAt?: string | null;
  createdAt: string;
  paymentReviewRequired?: boolean;
  items: OrderItem[];
};

type Summary = {
  totalOrders: number;
  pendingPayment: number;
  active: number;
  delivered: number;
  paidRevenue: number;
};

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3003';

const statusLabels: Record<string,string> = {
  pending_payment: 'Pendiente de pago',
  confirmed: 'Confirmado',
  preparing: 'Preparando',
  shipped: 'Enviado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

const paymentLabels: Record<string,string> = {
  pending: 'Pendiente',
  paid: 'Pagado',
  rejected: 'Rechazado',
  cancelled: 'Cancelado',
  refunded: 'Reintegrado',
};

export default function AdminOrdersPage() {
  const [token,setToken] = useState('');
  const [orders,setOrders] = useState<Order[]>([]);
  const [summary,setSummary] = useState<Summary | null>(null);
  const [selected,setSelected] = useState<Order | null>(null);
  const [search,setSearch] = useState('');
  const [status,setStatus] = useState('all');
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [toast,setToast] = useState<{type:'success'|'error';text:string}|null>(null);

  const authHeaders = useMemo(() => ({
    'Content-Type':'application/json',
    Authorization:`Bearer ${token}`,
  }),[token]);

  useEffect(() => {
    const saved = localStorage.getItem('ecommerce_token') ?? '';
    setToken(saved);
    if (saved) void load(saved,'all','');
    else setLoading(false);
  },[]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null),3200);
    return () => window.clearTimeout(timer);
  },[toast]);

  async function load(currentToken=token,currentStatus=status,currentSearch=search) {
    if (!currentToken) return;
    setLoading(true);
    try {
      const headers = { Authorization:`Bearer ${currentToken}` };
      const params = new URLSearchParams();
      if (currentStatus !== 'all') params.set('status',currentStatus);
      if (currentSearch.trim()) params.set('search',currentSearch.trim());

      const [ordersRes,summaryRes] = await Promise.all([
        fetch(`${API}/admin/orders?${params.toString()}`,{headers}),
        fetch(`${API}/admin/orders/summary`,{headers}),
      ]);

      if (!ordersRes.ok || !summaryRes.ok) throw new Error();

      const nextOrders: Order[] = await ordersRes.json();
      setOrders(nextOrders);
      setSummary(await summaryRes.json());

      if (selected) {
        const refreshed = nextOrders.find(order => order.id === selected.id);
        setSelected(refreshed ?? null);
      }
    } catch {
      setToast({type:'error',text:'No se pudieron cargar los pedidos.'});
    } finally {
      setLoading(false);
    }
  }

  async function changeStatus(order:Order,nextStatus:string) {
    setSaving(true);
    try {
      const response = await fetch(`${API}/admin/orders/${order.id}/status`,{
        method:'PATCH',
        headers:authHeaders,
        body:JSON.stringify({status:nextStatus}),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setToast({type:'error',text:data?.message ?? 'No se pudo cambiar el estado.'});
        return;
      }

      setToast({type:'success',text:`Pedido actualizado a ${statusLabels[nextStatus] ?? nextStatus}.`});
      await load();
      setSelected(data);
    } catch {
      setToast({type:'error',text:'No se pudo conectar con el servidor.'});
    } finally {
      setSaving(false);
    }
  }

  if (!token) {
    return (
      <main className="shell">
        <div className="card">
          <h1>Pedidos</h1>
          <p>Primero iniciá sesión con un usuario administrador.</p>
          <Link className="btn primary" href="/login">Ir al login</Link>
        </div>
      </main>
    );
  }

  return (
    <main className={`${styles.root} shell orders-admin-shell`}>
      <header className="topbar">
        <div>
          <div className="brand">Panel del comercio</div>
          <small>Gestión de pedidos y ventas</small>
        </div>
        <nav className="admin-nav" aria-label="Navegación del panel">
          <Link className="admin-nav-link" href="/admin/dashboard">Dashboard</Link>
          <Link className="admin-nav-link" href="/admin">Productos</Link>
          <Link className="admin-nav-link active" href="/admin/pedidos">Pedidos</Link>
          <Link className="admin-nav-link" href="/admin/clientes">Clientes</Link>
          <Link className="admin-store-link" href="/">↗ Ver tienda</Link>
        </nav>
      </header>

      {toast && (
        <div className={`toast toast-${toast.type}`}>
          <span className="toast-icon">{toast.type === 'success' ? '✓' : '!'}</span>
          <span>{toast.text}</span>
          <button onClick={() => setToast(null)}>×</button>
        </div>
      )}

      <section className="summary-grid orders-summary-grid">
        <article className="card">
          <span className="summary-kicker">Pedidos</span>
          <strong>{summary?.totalOrders ?? 0}</strong>
          <span>Total registrados</span>
        </article>
        <article className="card">
          <span className="summary-kicker">Pago</span>
          <strong>{summary?.pendingPayment ?? 0}</strong>
          <span>Pendientes de pago</span>
        </article>
        <article className="card">
          <span className="summary-kicker">En curso</span>
          <strong>{summary?.active ?? 0}</strong>
          <span>Confirmados / preparando / enviados</span>
        </article>
        <article className="card">
          <span className="summary-kicker">Ventas cobradas</span>
          <strong>$ {(summary?.paidRevenue ?? 0).toLocaleString('es-AR')}</strong>
          <span>Ingresos acreditados</span>
        </article>
      </section>

      <section className="card orders-toolbar-card">
        <div className="orders-toolbar">
          <div className="orders-search">
            <span>⌕</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void load(token,status,search)}
              placeholder="Buscar por pedido, cliente, email o teléfono"
            />
          </div>
          <select value={status} onChange={e => {
            const next=e.target.value;
            setStatus(next);
            void load(token,next,search);
          }}>
            <option value="all">Todos los estados</option>
            <option value="pending_payment">Pendiente de pago</option>
            <option value="confirmed">Confirmado</option>
            <option value="preparing">Preparando</option>
            <option value="shipped">Enviado</option>
            <option value="delivered">Entregado</option>
            <option value="cancelled">Cancelado</option>
          </select>
          <button className="btn primary" onClick={() => void load()}>Buscar</button>
        </div>
      </section>

      <section className="orders-layout">
        <article className="card orders-list-card">
          <div className="section-head">
            <div>
              <h2>Pedidos</h2>
              <p>{loading ? 'Actualizando...' : `${orders.length} pedido(s)`}</p>
            </div>
          </div>

          <div className="orders-list">
            {orders.map(order => (
              <button
                key={order.id}
                className={`order-row ${selected?.id===order.id?'selected':''}`}
                onClick={() => setSelected(order)}
              >
                <div className="order-main">
                  <div className="order-number-line">
                    <strong>{order.orderNumber}</strong>
                    <span className={`order-status status-${order.status}`}>
                      {statusLabels[order.status] ?? order.status}
                    </span>
                  </div>
                  <span>{order.customerName}</span>
                  <small>{new Date(order.createdAt).toLocaleString('es-AR')}</small>
                </div>
                <div className="order-row-side">
                  <strong>$ {order.total.toLocaleString('es-AR')}</strong>
                  <span className={`payment-pill payment-${order.paymentStatus}`}>
                    {paymentLabels[order.paymentStatus] ?? order.paymentStatus}
                  </span>
                </div>
              </button>
            ))}

            {!loading && orders.length===0 && (
              <div className="orders-empty">No hay pedidos con estos filtros.</div>
            )}
          </div>
        </article>

        <aside className="card order-detail-card">
          {!selected ? (
            <div className="order-detail-empty">
              <span>◎</span>
              <h3>Seleccioná un pedido</h3>
              <p>Acá vas a ver cliente, productos, entrega, pago y estado.</p>
            </div>
          ) : (
            <>
              <div className="order-detail-head">
                <div>
                  <small>Pedido</small>
                  <h2>{selected.orderNumber}</h2>
                </div>
                <span className={`order-status status-${selected.status}`}>
                  {statusLabels[selected.status] ?? selected.status}
                </span>
              </div>

              <div className="order-detail-section">
                <h3>Cliente</h3>
                <p><strong>{selected.customerName}</strong></p>
                <p>{selected.customerEmail}</p>
                <p>{selected.customerPhone}</p>
              </div>

              <div className="order-detail-section">
                <h3>Entrega</h3>
                <p>{selected.deliveryMethod==='shipping'?'Envío a domicilio':'Retiro por el comercio'}</p>
                {selected.address && <p>{selected.address}</p>}
                {selected.notes && <div className="order-notes">{selected.notes}</div>}
              </div>

              <div className="order-detail-section">
                <h3>Productos</h3>
                <div className="order-items">
                  {selected.items.map(item => (
                    <div key={item.id} className="order-item-line">
                      <div>
                        <strong>{item.quantity} × {item.productName}</strong>
                        <small>{item.sku}</small>
                      </div>
                      <span>$ {item.lineTotal.toLocaleString('es-AR')}</span>
                    </div>
                  ))}
                </div>
                <div className="order-total-line">
                  <span>Total</span>
                  <strong>$ {selected.total.toLocaleString('es-AR')}</strong>
                </div>
              </div>

              <div className="order-detail-section">
                <h3>Pago</h3>
                <div className="order-payment-row">
                  <span className={`payment-pill payment-${selected.paymentStatus}`}>
                    {paymentLabels[selected.paymentStatus] ?? selected.paymentStatus}
                  </span>
                  {selected.paidAt && <small>{new Date(selected.paidAt).toLocaleString('es-AR')}</small>}
                </div>
                {selected.paymentReviewRequired && (
                  <div className="payment-review-alert">
                    Este pedido requiere revisar el reintegro del pago en Mercado Pago.
                  </div>
                )}
              </div>

              <div className="order-detail-section">
                <h3>Actualizar estado</h3>
                <div className="order-actions">
                  {selected.status==='confirmed' && (
                    <button className="btn primary" disabled={saving} onClick={() => void changeStatus(selected,'preparing')}>Pasar a preparando</button>
                  )}
                  {selected.status==='preparing' && (
                    <button className="btn primary" disabled={saving} onClick={() => void changeStatus(selected,'shipped')}>Marcar enviado</button>
                  )}
                  {selected.status==='shipped' && (
                    <button className="btn primary" disabled={saving} onClick={() => void changeStatus(selected,'delivered')}>Marcar entregado</button>
                  )}
                  {!['cancelled','delivered','shipped'].includes(selected.status) && (
                    <button className="btn danger-btn" disabled={saving} onClick={() => {
                      if (window.confirm('¿Cancelar este pedido? El stock será devuelto.')) {
                        void changeStatus(selected,'cancelled');
                      }
                    }}>Cancelar pedido</button>
                  )}
                </div>
              </div>
            </>
          )}
        </aside>
      </section>
    </main>
  );
}
