'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  allowedActions: string[];
  email?: { status: string; attempts: number; sentAt?: string } | null;
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
  const [payment,setPayment] = useState('all');
  const [page,setPage] = useState(1);
  const [total,setTotal] = useState(0);
  const requestId = useRef(0);
  const detailId = useRef(0);
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

  async function load(currentToken=token,currentStatus=status,currentSearch=search,currentPayment=payment,currentPage=page) {
    if (!currentToken) return;
    const request = ++requestId.current;
    setLoading(true);
    try {
      const headers = { Authorization:`Bearer ${currentToken}` };
      const params = new URLSearchParams({payment:currentPayment,page:String(currentPage)});
      if (currentStatus !== 'all') params.set('status',currentStatus);
      if (currentSearch.trim()) params.set('search',currentSearch.trim());

      const [ordersRes,summaryRes] = await Promise.all([
        fetch(`${API}/admin/orders?${params.toString()}`,{headers}),
        fetch(`${API}/admin/orders/summary`,{headers}),
      ]);

      if (!ordersRes.ok || !summaryRes.ok) throw new Error();

      const result = await ordersRes.json();
      const nextSummary = await summaryRes.json();
      if (request !== requestId.current) return;
      const nextOrders: Order[] = result.orders;
      setOrders(nextOrders); setPage(result.page); setTotal(result.total);
      setSummary(nextSummary);

      if (selected) {
        const refreshed = nextOrders.find(order => order.id === selected.id);
        if (refreshed) void openDetail(refreshed);
        else { detailId.current++; setSelected(null); }
      }
    } catch {
      if (request === requestId.current) setToast({type:'error',text:'No se pudieron cargar los pedidos. Revisá tu sesión y volvé a intentar.'});
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }

  async function openDetail(order: Order) {
    const request = ++detailId.current;
    setSelected(order);
    try {
      const response = await fetch(`${API}/admin/orders/${order.id}`, { headers: authHeaders });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (request === detailId.current) setSelected(data);
    } catch { if (request === detailId.current) setToast({type:'error',text:'No se pudo actualizar el detalle. Intentá nuevamente.'}); }
  }

  async function changeStatus(order:Order,nextStatus:string) {
    if (saving) return;
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
      detailId.current++;
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
          <Link className="admin-nav-link" href="/admin/configuracion">Configuración</Link>
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
              aria-label="Buscar pedidos"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void load(token,status,search,payment,1)}
              placeholder="Buscar por pedido, cliente, email o teléfono"
            />
          </div>
          <select aria-label="Filtrar por estado" value={status} onChange={e => {
            const next=e.target.value;
            setStatus(next);
            void load(token,next,search,payment,1);
          }}>
            <option value="all">Todos los estados</option>
            <option value="pending_payment">Pendiente de pago</option>
            <option value="confirmed">Confirmado</option>
            <option value="preparing">Preparando</option>
            <option value="shipped">Enviado</option>
            <option value="delivered">Entregado</option>
            <option value="cancelled">Cancelado</option>
          </select>
          <select aria-label="Filtrar por pago" value={payment} onChange={e => {setPayment(e.target.value); void load(token,status,search,e.target.value,1);}}>
            <option value="all">Todos los pagos</option>
            {Object.entries(paymentLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button className="btn primary" disabled={loading} onClick={() => void load(token,status,search,payment,1)}>Buscar</button>
        </div>
      </section>

      <section className="orders-layout">
        <article className="card orders-list-card">
          <div className="section-head">
            <div>
              <h2>Pedidos</h2>
              <p>{loading ? 'Actualizando...' : `${total} pedido(s) · Página ${page}`}</p>
            </div>
          </div>

          <div className="orders-list">
            {orders.map(order => (
              <button
                key={order.id}
                className={`order-row ${selected?.id===order.id?'selected':''}`}
                disabled={saving}
                onClick={() => void openDetail(order)}
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
          <div className="order-actions" aria-label="Páginas de pedidos">
            <button className="btn" disabled={loading || saving || page <= 1} onClick={() => void load(token,status,search,payment,page-1)}>Anterior</button>
            <button className="btn" disabled={loading || saving || page*50 >= total} onClick={() => void load(token,status,search,payment,page+1)}>Siguiente</button>
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
                    Este pedido requiere revisión del pago o del stock. Cancelar no realiza un reintegro automático en Mercado Pago.
                  </div>
                )}
              </div>

              <div className="order-detail-section">
                <h3>Confirmación por correo</h3>
                <p>{selected.email ? ({pending:'Pendiente de envío',sending:'Enviando',sent:'Enviado al proveedor',failed:'Requiere revisión'}[selected.email.status] ?? selected.email.status) : 'Sin registro de envío'}</p>
                {selected.email && <small>Intentos: {selected.email.attempts}</small>}
              </div>
              <div className="order-detail-section">
                <h3>Actualizar estado</h3>
                {selected.status === 'pending_payment' && <p>Esperando confirmación del pago. Las reservas vencidas se liberan automáticamente después de verificar Mercado Pago.</p>}
                <div className="order-actions">
                  {selected.allowedActions?.includes('preparing') && (
                    <button className="btn primary" disabled={saving} onClick={() => void changeStatus(selected,'preparing')}>Pasar a preparando</button>
                  )}
                  {selected.allowedActions?.includes('shipped') && (
                    <button className="btn primary" disabled={saving} onClick={() => void changeStatus(selected,'shipped')}>Marcar enviado</button>
                  )}
                  {selected.allowedActions?.includes('delivered') && (
                    <button className="btn primary" disabled={saving} onClick={() => void changeStatus(selected,'delivered')}>Marcar entregado</button>
                  )}
                  {selected.allowedActions?.includes('cancelled') && (
                    <button className="btn danger-btn" disabled={saving} onClick={() => {
                      if (window.confirm('¿Cancelar este pedido y devolver su stock? Si está pagado, el reintegro debe gestionarse por separado en Mercado Pago.')) {
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
