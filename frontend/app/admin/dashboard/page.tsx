'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import styles from './dashboard.module.css';

type DashboardData = {
  periodDays:number;
  summary:{
    revenue:number;
    revenueChange:number;
    paidOrders:number;
    paidOrdersChange:number;
    averageTicket:number;
    averageTicketChange:number;
    buyers:number;
    buyersChange:number;
    registeredCustomers:number;
    activeProducts:number;
    openOrders:number;
    lowStock:number;
    pendingPayments:number;
  };
  salesSeries:Array<{date:string;revenue:number;orders:number}>;
  topProducts:Array<{productId:string;sku:string;name:string;units:number;revenue:number}>;
  recentOrders:Array<{id:string;orderNumber:string;status:string;paymentStatus:string;customerName:string;total:number;createdAt:string}>;
  lowStockProducts:Array<{id:string;sku:string;name:string;currentStock:number;minimumStock:number}>;
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

const paymentLabels:Record<string,string>={
  pending:'Pendiente',
  paid:'Pagado',
  rejected:'Rechazado',
  cancelled:'Cancelado',
  refunded:'Reintegrado',
};

function money(value:number){
  return '$ '+value.toLocaleString('es-AR',{maximumFractionDigits:0});
}

function changeText(value:number){
  const rounded=Math.round(value*10)/10;
  return `${rounded>0?'+':''}${rounded.toLocaleString('es-AR')}%`;
}

export default function AdminDashboardPage(){
  const [token,setToken]=useState('');
  const [days,setDays]=useState(30);
  const [data,setData]=useState<DashboardData|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  useEffect(()=>{
    const saved=localStorage.getItem('ecommerce_token') ?? '';
    setToken(saved);
    if(saved) void load(saved,30);
    else setLoading(false);
  },[]);

  async function load(currentToken=token,currentDays=days){
    if(!currentToken) return;
    setLoading(true);
    setError('');
    try{
      const response=await fetch(`${API}/admin/dashboard?days=${currentDays}`,{
        headers:{Authorization:`Bearer ${currentToken}`},
        cache:'no-store',
      });
      if(!response.ok) throw new Error();
      setData(await response.json());
    }catch{
      setError('No se pudo cargar el dashboard.');
    }finally{
      setLoading(false);
    }
  }

  const maxRevenue=useMemo(
    ()=>Math.max(1,...(data?.salesSeries.map(item=>item.revenue) ?? [1])),
    [data],
  );

  if(!token){
    return (
      <main className="shell">
        <div className="card">
          <h1>Dashboard</h1>
          <p>Primero iniciá sesión con un usuario administrador.</p>
          <Link className="btn primary" href="/login">Ir al login</Link>
        </div>
      </main>
    );
  }

  return (
    <main className={`${styles.root} shell dashboard-shell`}>
      <header className="topbar">
        <div>
          <div className="brand">Panel del comercio</div>
          <small>Resumen general del negocio</small>
        </div>
        <nav className="admin-nav" aria-label="Navegación del panel">
          <Link className="admin-nav-link active" href="/admin/dashboard">Dashboard</Link>
          <Link className="admin-nav-link" href="/admin">Productos</Link>
          <Link className="admin-nav-link" href="/admin/pedidos">Pedidos</Link>
          <Link className="admin-nav-link" href="/admin/clientes">Clientes</Link>
          <Link className="admin-store-link" href="/">↗ Ver tienda</Link>
        </nav>
      </header>

      <section className="dashboard-heading">
        <div>
          <span className="dashboard-kicker">RESUMEN COMERCIAL</span>
          <h1>Dashboard</h1>
          <p>Ventas, pedidos, clientes y stock en un solo lugar.</p>
        </div>
        <div className="dashboard-periods">
          {[7,30,90].map(value=>(
            <button
              key={value}
              className={days===value?'active':''}
              onClick={()=>{
                setDays(value);
                void load(token,value);
              }}
            >
              {value} días
            </button>
          ))}
        </div>
      </section>

      {error && <div className="dashboard-alert">{error}<button onClick={()=>void load()}>Reintentar</button></div>}

      <section className="dashboard-metrics">
        <article className="dashboard-metric-card">
          <span>Ventas cobradas</span>
          <strong>{money(data?.summary.revenue ?? 0)}</strong>
          <small className={(data?.summary.revenueChange ?? 0)>=0?'positive':'negative'}>{changeText(data?.summary.revenueChange ?? 0)} vs período anterior</small>
        </article>
        <article className="dashboard-metric-card">
          <span>Pedidos pagados</span>
          <strong>{data?.summary.paidOrders ?? 0}</strong>
          <small className={(data?.summary.paidOrdersChange ?? 0)>=0?'positive':'negative'}>{changeText(data?.summary.paidOrdersChange ?? 0)} vs período anterior</small>
        </article>
        <article className="dashboard-metric-card">
          <span>Ticket promedio</span>
          <strong>{money(data?.summary.averageTicket ?? 0)}</strong>
          <small className={(data?.summary.averageTicketChange ?? 0)>=0?'positive':'negative'}>{changeText(data?.summary.averageTicketChange ?? 0)} vs período anterior</small>
        </article>
        <article className="dashboard-metric-card">
          <span>Compradores</span>
          <strong>{data?.summary.buyers ?? 0}</strong>
          <small className={(data?.summary.buyersChange ?? 0)>=0?'positive':'negative'}>{changeText(data?.summary.buyersChange ?? 0)} vs período anterior</small>
        </article>
      </section>

      <section className="dashboard-secondary-metrics">
        <Link href="/admin/pedidos"><span>Pedidos en curso</span><strong>{data?.summary.openOrders ?? 0}</strong></Link>
        <Link href="/admin/pedidos"><span>Pagos pendientes</span><strong>{data?.summary.pendingPayments ?? 0}</strong></Link>
        <Link href="/admin/clientes"><span>Clientes registrados</span><strong>{data?.summary.registeredCustomers ?? 0}</strong></Link>
        <Link href="/admin"><span>Productos activos</span><strong>{data?.summary.activeProducts ?? 0}</strong></Link>
        <Link href="/admin"><span>Stock bajo</span><strong>{data?.summary.lowStock ?? 0}</strong></Link>
      </section>

      <section className="dashboard-main-grid">
        <article className="card dashboard-chart-card">
          <div className="dashboard-card-head">
            <div>
              <span className="dashboard-kicker">EVOLUCIÓN</span>
              <h2>Ventas por día</h2>
            </div>
            <strong>{money(data?.summary.revenue ?? 0)}</strong>
          </div>

          {loading ? (
            <div className="dashboard-loading">Cargando ventas...</div>
          ) : (
            <div className="sales-chart" aria-label="Evolución de ventas por día">
              {(data?.salesSeries ?? []).map((item,index)=>(
                <div className="sales-bar-wrap" key={item.date} title={`${item.date}: ${money(item.revenue)} · ${item.orders} pedido(s)`}>
                  <div className="sales-bar-track">
                    <div className="sales-bar" style={{height:`${Math.max(item.revenue?5:0,(item.revenue/maxRevenue)*100)}%`}} />
                  </div>
                  {(days===7 || index%(days===30?5:15)===0) && <small>{new Date(item.date+'T12:00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'})}</small>}
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="card dashboard-top-products">
          <div className="dashboard-card-head">
            <div>
              <span className="dashboard-kicker">RENDIMIENTO</span>
              <h2>Productos más vendidos</h2>
            </div>
          </div>

          <div className="dashboard-ranking">
            {(data?.topProducts ?? []).map((product,index)=>(
              <div className="dashboard-product-row" key={product.productId}>
                <span className="rank">{index+1}</span>
                <div>
                  <strong>{product.name}</strong>
                  <small>{product.sku} · {product.units} unidad(es)</small>
                </div>
                <strong>{money(product.revenue)}</strong>
              </div>
            ))}
            {!loading && !(data?.topProducts.length) && <div className="dashboard-empty">Todavía no hay ventas acreditadas en este período.</div>}
          </div>
        </article>
      </section>

      <section className="dashboard-bottom-grid">
        <article className="card">
          <div className="dashboard-card-head">
            <div>
              <span className="dashboard-kicker">ACTIVIDAD</span>
              <h2>Pedidos recientes</h2>
            </div>
            <Link href="/admin/pedidos">Ver todos →</Link>
          </div>

          <div className="dashboard-orders">
            {(data?.recentOrders ?? []).map(order=>(
              <Link href="/admin/pedidos" className="dashboard-order-row" key={order.id}>
                <div>
                  <strong>{order.orderNumber}</strong>
                  <span>{order.customerName}</span>
                  <small>{new Date(order.createdAt).toLocaleString('es-AR')}</small>
                </div>
                <div>
                  <strong>{money(order.total)}</strong>
                  <span className={`dashboard-status status-${order.status}`}>{orderLabels[order.status] ?? order.status}</span>
                  <small>{paymentLabels[order.paymentStatus] ?? order.paymentStatus}</small>
                </div>
              </Link>
            ))}
            {!loading && !(data?.recentOrders.length) && <div className="dashboard-empty">Todavía no hay pedidos.</div>}
          </div>
        </article>

        <article className="card">
          <div className="dashboard-card-head">
            <div>
              <span className="dashboard-kicker">INVENTARIO</span>
              <h2>Alertas de stock</h2>
            </div>
            <Link href="/admin">Gestionar →</Link>
          </div>

          <div className="dashboard-stock-list">
            {(data?.lowStockProducts ?? []).map(product=>(
              <div className="dashboard-stock-row" key={product.id}>
                <div>
                  <strong>{product.name}</strong>
                  <small>{product.sku}</small>
                </div>
                <div>
                  <strong>{product.currentStock}</strong>
                  <small>Mín. {product.minimumStock}</small>
                </div>
              </div>
            ))}
            {!loading && !(data?.lowStockProducts.length) && (
              <div className="dashboard-stock-ok">
                <span>✓</span>
                <div><strong>Stock bajo control</strong><small>No hay productos debajo del mínimo.</small></div>
              </div>
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
