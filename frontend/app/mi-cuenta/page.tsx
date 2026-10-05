'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCustomerAuth } from '../customer-auth-context';
import { API_URL } from '../storefront-types';
import styles from '../cliente/customer.module.css';

type CustomerOrder = {
  id:string;
  orderNumber:string;
  status:string;
  paymentStatus:string;
  total:number;
  deliveryMethod:'pickup'|'shipping';
  address?:string|null;
  createdAt:string;
  paidAt?:string|null;
};

const statusLabels:Record<string,string>={
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

export default function CustomerAccountPage(){
  const { user,token,loading,updateProfile,logout } = useCustomerAuth();
  const router = useRouter();
  const [orders,setOrders] = useState<CustomerOrder[]>([]);
  const [message,setMessage] = useState('');
  const [saving,setSaving] = useState(false);

  useEffect(()=>{
    if (!loading && !user) router.replace('/cliente/login?next=/mi-cuenta');
  },[loading,user,router]);

  useEffect(()=>{
    if(!token) return;
    fetch(`${API_URL}/customer/account/orders`,{
      headers:{Authorization:`Bearer ${token}`},
      cache:'no-store',
    })
      .then(async response=>{
        if(!response.ok) throw new Error();
        setOrders(await response.json());
      })
      .catch(()=>setMessage('No se pudo cargar el historial de pedidos.'));
  },[token]);

  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setMessage('');

    const result = await updateProfile({
      name:String(form.get('name') ?? ''),
      phone:String(form.get('phone') ?? ''),
      defaultAddress:String(form.get('defaultAddress') ?? ''),
    });

    setSaving(false);
    setMessage(result.ok?'Datos actualizados correctamente.':(result.message ?? 'No se pudo actualizar.'));
  }

  if(loading || !user){
    return <main className={styles.root}><div className={styles.shell}><div className={styles.loadingCard}>Cargando cuenta...</div></div></main>;
  }

  return (
    <main className={styles.root}>
      <div className={styles.accountShell}>
        <header className={styles.accountHeader}>
          <div>
            <Link href="/tienda" className={styles.back}>← Volver a la tienda</Link>
            <span className={styles.eyebrow}>MI CUENTA</span>
            <h1>Hola, {user.name.split(' ')[0]}</h1>
            <p>Administrá tus datos y consultá tus compras.</p>
          </div>
          <button className="btn secondary" onClick={()=>{logout();router.push('/tienda');}}>Cerrar sesión</button>
        </header>

        {message && <div className={message.includes('correctamente')?styles.success:styles.alert}>{message}</div>}

        <div className={styles.accountGrid}>
          <section className={styles.panel}>
            <h2>Mis datos</h2>
            <form onSubmit={save} className={styles.form} key={user.id+`${user.phone}${user.defaultAddress}`}>
              <label>
                Nombre y apellido
                <input name="name" defaultValue={user.name} required />
              </label>
              <label>
                Email
                <input value={user.email} disabled />
              </label>
              <label>
                Teléfono
                <input name="phone" type="tel" defaultValue={user.phone ?? ''} />
              </label>
              <label>
                Dirección habitual
                <input name="defaultAddress" defaultValue={user.defaultAddress ?? ''} placeholder="Calle, número, localidad" />
              </label>
              <button className="btn primary" type="submit" disabled={saving}>
                {saving?'Guardando...':'Guardar cambios'}
              </button>
            </form>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <span className={styles.eyebrow}>HISTORIAL</span>
                <h2>Mis pedidos</h2>
              </div>
              <strong>{orders.length}</strong>
            </div>

            <div className={styles.orderList}>
              {orders.map(order=>(
                <article key={order.id} className={styles.orderCard}>
                  <div className={styles.orderTop}>
                    <div>
                      <strong>{order.orderNumber}</strong>
                      <small>{new Date(order.createdAt).toLocaleString('es-AR')}</small>
                    </div>
                    <strong>$ {order.total.toLocaleString('es-AR')}</strong>
                  </div>
                  <div className={styles.orderMeta}>
                    <span>{statusLabels[order.status] ?? order.status}</span>
                    <span>{paymentLabels[order.paymentStatus] ?? order.paymentStatus}</span>
                    <span>{order.deliveryMethod==='shipping'?'Envío':'Retiro'}</span>
                  </div>
                </article>
              ))}
              {!orders.length && (
                <div className={styles.empty}>
                  <h3>Todavía no tenés pedidos</h3>
                  <p>Cuando hagas una compra, va a aparecer acá.</p>
                  <Link className="btn primary" href="/tienda">Ver productos</Link>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
