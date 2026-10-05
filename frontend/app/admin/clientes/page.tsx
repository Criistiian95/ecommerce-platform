'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import styles from './customers.module.css';

type Customer = {
  key:string;
  customerId?:string|null;
  registered:boolean;
  name:string;
  email:string;
  phone:string;
  ordersCount:number;
  paidOrdersCount:number;
  totalSpent:number;
  lastOrderAt:string|null;
  lastOrderNumber:string|null;
};

type CustomerDetail = Customer & {
  orders:Array<{
    id:string;
    orderNumber:string;
    status:string;
    paymentStatus:string;
    total:number;
    deliveryMethod:'pickup'|'shipping';
    address?:string|null;
    createdAt:string;
  }>;
};

type Summary = {
  totalCustomers:number;
  registeredCustomers:number;
  guestCustomers:number;
  repeatCustomers:number;
  paidRevenue:number;
  averageTicket:number;
};

const API=process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3003';

const orderLabels:Record<string,string>={
  pending_payment:'Pendiente de pago',
  confirmed:'Confirmado',
  preparing:'Preparando',
  shipped:'Enviado',
  delivered:'Entregado',
  cancelled:'Cancelado',
};

export default function AdminCustomersPage(){
  const [token,setToken]=useState('');
  const [customers,setCustomers]=useState<Customer[]>([]);
  const [summary,setSummary]=useState<Summary|null>(null);
  const [selected,setSelected]=useState<CustomerDetail|null>(null);
  const [search,setSearch]=useState('');
  const [loading,setLoading]=useState(true);
  const [toast,setToast]=useState('');

  useEffect(()=>{
    const saved=localStorage.getItem('ecommerce_token') ?? '';
    setToken(saved);
    if(saved) void load(saved,'');
    else setLoading(false);
  },[]);

  async function load(currentToken=token,currentSearch=search){
    if(!currentToken) return;
    setLoading(true);
    try{
      const headers={Authorization:`Bearer ${currentToken}`};
      const params=new URLSearchParams();
      if(currentSearch.trim()) params.set('search',currentSearch.trim());

      const [listRes,summaryRes]=await Promise.all([
        fetch(`${API}/admin/customers?${params.toString()}`,{headers}),
        fetch(`${API}/admin/customers/summary`,{headers}),
      ]);

      if(!listRes.ok || !summaryRes.ok) throw new Error();
      setCustomers(await listRes.json());
      setSummary(await summaryRes.json());
    }catch{
      setToast('No se pudieron cargar los clientes.');
    }finally{
      setLoading(false);
    }
  }

  async function openCustomer(customer:Customer){
    try{
      const response=await fetch(
        `${API}/admin/customers/${encodeURIComponent(customer.key)}`,
        {headers:{Authorization:`Bearer ${token}`}},
      );
      if(!response.ok) throw new Error();
      setSelected(await response.json());
    }catch{
      setToast('No se pudo cargar el detalle del cliente.');
    }
  }

  if(!token){
    return (
      <main className="shell">
        <div className="card">
          <h1>Clientes</h1>
          <p>Primero iniciá sesión con un usuario administrador.</p>
          <Link className="btn primary" href="/login">Ir al login</Link>
        </div>
      </main>
    );
  }

  return (
    <main className={`${styles.root} shell customers-admin-shell`}>
      <header className="topbar">
        <div>
          <div className="brand">Panel del comercio</div>
          <small>Clientes e historial de compras</small>
        </div>
        <div className="admin-nav-actions">
          <Link className="btn secondary" href="/admin">Productos</Link>
          <Link className="btn secondary" href="/admin/pedidos">Pedidos</Link>
          <Link className="btn secondary" href="/">Ver tienda</Link>
        </div>
      </header>

      {toast && (
        <div className="toast toast-error">
          <span className="toast-icon">!</span>
          <span>{toast}</span>
          <button onClick={()=>setToast('')}>×</button>
        </div>
      )}

      <section className="summary-grid customers-summary-grid">
        <article className="card"><span className="summary-kicker">Clientes</span><strong>{summary?.totalCustomers ?? 0}</strong><span>Compradores únicos</span></article>
        <article className="card"><span className="summary-kicker">Registrados</span><strong>{summary?.registeredCustomers ?? 0}</strong><span>Con cuenta en la tienda</span></article>
        <article className="card"><span className="summary-kicker">Facturación</span><strong>$ {(summary?.paidRevenue ?? 0).toLocaleString('es-AR')}</strong><span>Ventas acreditadas</span></article>
        <article className="card"><span className="summary-kicker">Ticket promedio</span><strong>$ {(summary?.averageTicket ?? 0).toLocaleString('es-AR')}</strong><span>Por compra pagada</span></article>
      </section>

      <section className="card customers-toolbar-card">
        <div className="customers-toolbar">
          <div className="customers-search">
            <span>⌕</span>
            <input
              value={search}
              onChange={e=>setSearch(e.target.value)}
              onKeyDown={e=>e.key==='Enter' && void load(token,search)}
              placeholder="Buscar por nombre, email o teléfono"
            />
          </div>
          <button className="btn primary" onClick={()=>void load()}>Buscar</button>
        </div>
      </section>

      <section className="customers-layout">
        <article className="card customers-list-card">
          <div className="section-head">
            <div>
              <h2>Clientes</h2>
              <p>{loading?'Actualizando...':`${customers.length} cliente(s)`}</p>
            </div>
          </div>

          <div className="customers-list">
            {customers.map(customer=>(
              <button
                key={customer.key}
                className={`customer-row ${selected?.key===customer.key?'selected':''}`}
                onClick={()=>void openCustomer(customer)}
              >
                <div className="customer-avatar">{customer.name?.charAt(0)?.toUpperCase() || '?'}</div>
                <div className="customer-main">
                  <div className="customer-name-line"><strong>{customer.name}</strong><span className={customer.registered?'customer-type registered':'customer-type guest'}>{customer.registered?'Registrado':'Invitado'}</span></div>
                  <span>{customer.email}</span>
                  <small>{customer.phone || 'Sin teléfono'}</small>
                </div>
                <div className="customer-side">
                  <strong>$ {customer.totalSpent.toLocaleString('es-AR')}</strong>
                  <span>{customer.ordersCount} pedido(s)</span>
                  <small>{customer.lastOrderAt?`Última compra ${new Date(customer.lastOrderAt).toLocaleDateString('es-AR')}`:'Sin compras todavía'}</small>
                </div>
              </button>
            ))}
            {!loading && customers.length===0 && <div className="customers-empty">No hay clientes con estos filtros.</div>}
          </div>
        </article>

        <aside className="card customer-detail-card">
          {!selected ? (
            <div className="customer-detail-empty">
              <span>◎</span>
              <h3>Seleccioná un cliente</h3>
              <p>Acá vas a ver sus datos y el historial de compras.</p>
            </div>
          ) : (
            <>
              <div className="customer-detail-head">
                <div className="customer-avatar large">{selected.name?.charAt(0)?.toUpperCase() || '?'}</div>
                <div>
                  <small>{selected.registered?'Cliente registrado':'Cliente invitado'}</small>
                  <h2>{selected.name}</h2>
                  <p>{selected.email}</p>
                  <p>{selected.phone}</p>
                </div>
              </div>

              <div className="customer-metrics">
                <div><strong>{selected.ordersCount}</strong><span>Pedidos</span></div>
                <div><strong>{selected.paidOrdersCount}</strong><span>Pagados</span></div>
                <div><strong>$ {selected.totalSpent.toLocaleString('es-AR')}</strong><span>Total gastado</span></div>
              </div>

              <div className="customer-detail-section">
                <h3>Historial de compras</h3>
                <div className="customer-orders">
                  {selected.orders.map(order=>(
                    <Link key={order.id} href="/admin/pedidos" className="customer-order-line">
                      <div>
                        <strong>{order.orderNumber}</strong>
                        <small>{new Date(order.createdAt).toLocaleString('es-AR')}</small>
                      </div>
                      <div>
                        <span className={`customer-order-status status-${order.status}`}>{orderLabels[order.status] ?? order.status}</span>
                        <strong>$ {order.total.toLocaleString('es-AR')}</strong>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </>
          )}
        </aside>
      </section>
    </main>
  );
}
