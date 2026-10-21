import Link from 'next/link';
export default function SubscriptionResult(){
 return <main className="login">
  <Link href="/">DISEÑOLYS</Link>
  <h1>Estamos verificando tu suscripción</h1>
  <p>Volver desde Mercado Pago no garantiza que el pago haya sido aprobado. La tienda se habilitará cuando confirmemos el cobro con Mercado Pago.</p>
  <p>Si el pago quedó pendiente, podés volver a iniciar sesión con tu cuenta de comerciante para consultar o reintentar el proceso.</p>
  <Link className="btn primary" href="/login">Ir al acceso de comercios</Link>
 </main>;
}
