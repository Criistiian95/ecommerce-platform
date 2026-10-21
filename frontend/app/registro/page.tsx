'use client';
import Link from 'next/link';
import {FormEvent,useState} from 'react';
import {API_URL} from '../storefront-types';
export default function RegisterCommerce(){
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [created,setCreated]=useState(false);
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(busy)return;const f=new FormData(e.currentTarget);setBusy(true);setError('');
  try{const payload=Object.fromEntries(f);const r=await fetch(`${API_URL}/auth/commerce/register`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const d=await r.json();if(!r.ok)throw Error(d.message||'No se pudo crear la tienda.');setCreated(true);
  }catch(e){setError(e instanceof Error?e.message:'No pudimos conectarnos. Intentá nuevamente.');}finally{setBusy(false);}}
 return <main className="login"><Link href="/">DISEÑOLYS</Link><h1>Solicitá tu tienda</h1><p>Abono mensual: USD 25. El envío del formulario no genera un cobro; activaremos la tienda una vez verificado el pago.</p>{created&&<p role="status">Solicitud registrada. Tu tienda está pendiente de pago y activación.</p>}{!created&&<form onSubmit={submit}><fieldset disabled={busy} style={{border:0,padding:0}}>
 <label className="field">Nombre del comercio<input name="commerceName" maxLength={120} required autoComplete="organization"/></label>
 <label className="field">Identificador de tu tienda<input name="commerceSlug" minLength={3} maxLength={63} pattern="[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])" placeholder="cfz-carpinteria" required/><small>Letras minúsculas, números y guiones. Forma parte del enlace de tu tienda.</small></label>
 <label className="field">Tu nombre<input name="adminName" maxLength={120} autoComplete="name" required/></label>
 <label className="field">Tu email de administrador<input name="email" type="email" maxLength={190} autoComplete="email" required/></label>
 <label className="field">Contraseña<input name="password" type="password" minLength={10} maxLength={72} autoComplete="new-password" required/><small>Al menos 10 caracteres.</small></label>
 <button className="btn primary" type="submit">{busy?'Creando tienda…':'Solicitar alta de tienda'}</button></fieldset></form>}{error&&<p role="alert">{error}</p>}<p><Link href="/login">Ya tengo una tienda · Iniciar sesión</Link></p></main>;
}
