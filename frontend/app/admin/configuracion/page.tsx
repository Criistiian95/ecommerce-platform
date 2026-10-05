'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import styles from './settings.module.css';

type Settings = {
  id:string;
  name:string;
  slug:string;
  tagline?:string|null;
  primaryColor:string;
  secondaryColor:string;
  logoUrl?:string|null;
  logoMimeType?:string|null;
  hasUploadedLogo:boolean;
  whatsapp?:string|null;
  contactEmail?:string|null;
  contactPhone?:string|null;
  address?:string|null;
  businessHours?:string|null;
  pickupEnabled:boolean;
  shippingEnabled:boolean;
};

const API=process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3003';

async function fileToBase64(file:File){
  if(file.size>2*1024*1024) throw new Error('El logo no puede superar 2 MB.');
  const allowed=['image/jpeg','image/png','image/webp'];
  if(!allowed.includes(file.type)) throw new Error('El logo debe ser JPG, PNG o WebP.');

  return await new Promise<{data:string;mimeType:string}>((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('No se pudo leer el logo.'));
    reader.onload=()=>{
      const result=String(reader.result ?? '');
      const comma=result.indexOf(',');
      if(comma===-1) return reject(new Error('No se pudo procesar el logo.'));
      resolve({data:result.slice(comma+1),mimeType:file.type});
    };
    reader.readAsDataURL(file);
  });
}

export default function CommerceSettingsPage(){
  const [token,setToken]=useState('');
  const [settings,setSettings]=useState<Settings|null>(null);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState('');
  const [messageType,setMessageType]=useState<'success'|'error'>('success');
  const [previewName,setPreviewName]=useState('');
  const [previewTagline,setPreviewTagline]=useState('');
  const [previewPrimary,setPreviewPrimary]=useState('#245ce6');
  const [previewSecondary,setPreviewSecondary]=useState('#172238');

  useEffect(()=>{
    const saved=localStorage.getItem('ecommerce_token') ?? '';
    setToken(saved);
    if(saved) void load(saved);
  },[]);

  async function load(currentToken=token){
    if(!currentToken) return;
    try{
      const response=await fetch(`${API}/admin/commerce/settings`,{
        headers:{Authorization:`Bearer ${currentToken}`},
        cache:'no-store',
      });
      if(!response.ok) throw new Error();
      const data:Settings=await response.json();
      setSettings(data);
      setPreviewName(data.name);
      setPreviewTagline(data.tagline ?? '');
      setPreviewPrimary(data.primaryColor || '#245ce6');
      setPreviewSecondary(data.secondaryColor || '#172238');
    }catch{
      setMessageType('error');
      setMessage('No se pudo cargar la configuración del comercio.');
    }
  }

  const logoSrc=useMemo(()=>{
    if(!settings) return '';
    if(settings.hasUploadedLogo) return `${API}/catalog/store/${settings.slug}/logo`;
    return settings.logoUrl ?? '';
  },[settings]);

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!settings) return;

    const form=new FormData(event.currentTarget);
    setSaving(true);
    setMessage('');

    try{
      const file=form.get('logoFile');
      const uploaded=file instanceof File && file.size>0 ? await fileToBase64(file) : null;

      const payload={
        name:String(form.get('name') ?? ''),
        tagline:String(form.get('tagline') ?? '') || null,
        primaryColor:String(form.get('primaryColor') ?? '#245ce6'),
        secondaryColor:String(form.get('secondaryColor') ?? '#172238'),
        logoUrl:uploaded?null:(String(form.get('logoUrl') ?? '') || null),
        logoDataBase64:uploaded?.data ?? null,
        logoMimeType:uploaded?.mimeType ?? null,
        whatsapp:String(form.get('whatsapp') ?? '') || null,
        contactEmail:String(form.get('contactEmail') ?? '') || null,
        contactPhone:String(form.get('contactPhone') ?? '') || null,
        address:String(form.get('address') ?? '') || null,
        businessHours:String(form.get('businessHours') ?? '') || null,
        pickupEnabled:form.get('pickupEnabled')==='on',
        shippingEnabled:form.get('shippingEnabled')==='on',
      };

      const response=await fetch(`${API}/admin/commerce/settings`,{
        method:'PATCH',
        headers:{
          'Content-Type':'application/json',
          Authorization:`Bearer ${token}`,
        },
        body:JSON.stringify(payload),
      });
      const data=await response.json().catch(()=>null);

      if(!response.ok){
        setMessageType('error');
        setMessage(data?.message ?? 'No se pudo guardar la configuración.');
        return;
      }

      setSettings(data);
      setPreviewName(data.name);
      setPreviewTagline(data.tagline ?? '');
      setPreviewPrimary(data.primaryColor);
      setPreviewSecondary(data.secondaryColor);
      setMessageType('success');
      setMessage('Configuración guardada correctamente.');
    }catch(error){
      setMessageType('error');
      setMessage(error instanceof Error?error.message:'No se pudo guardar la configuración.');
    }finally{
      setSaving(false);
    }
  }

  if(!token){
    return (
      <main className="shell">
        <div className="card">
          <h1>Configuración</h1>
          <p>Primero iniciá sesión con un usuario administrador.</p>
          <Link className="btn primary" href="/login">Ir al login</Link>
        </div>
      </main>
    );
  }

  return (
    <main className={`${styles.root} shell commerce-settings-shell`}>
      <header className="topbar">
        <div>
          <div className="brand">Panel del comercio</div>
          <small>Personalización de la tienda</small>
        </div>
        <nav className="admin-nav" aria-label="Navegación del panel">
          <Link className="admin-nav-link" href="/admin/dashboard">Dashboard</Link>
          <Link className="admin-nav-link" href="/admin">Productos</Link>
          <Link className="admin-nav-link" href="/admin/pedidos">Pedidos</Link>
          <Link className="admin-nav-link" href="/admin/clientes">Clientes</Link>
          <Link className="admin-nav-link active" href="/admin/configuracion">Configuración</Link>
          <Link className="admin-store-link" href="/">↗ Ver tienda</Link>
        </nav>
      </header>

      <section className="settings-heading">
        <div>
          <span className="settings-kicker">TU MARCA</span>
          <h1>Configuración de la tienda</h1>
          <p>Personalizá la identidad, contacto y modalidades de entrega de tu comercio.</p>
        </div>
      </section>

      {message && <div className={messageType==='success'?'settings-message success':'settings-message error'}>{message}</div>}

      {!settings ? (
        <div className="card settings-loading">Cargando configuración...</div>
      ) : (
        <form onSubmit={submit} className="settings-layout">
          <div className="settings-main">
            <section className="card settings-card">
              <div className="settings-card-head">
                <div><span className="settings-kicker">IDENTIDAD</span><h2>Marca y apariencia</h2></div>
              </div>

              <div className="settings-grid">
                <label className="field">
                  Nombre comercial
                  <input name="name" defaultValue={settings.name} required maxLength={120} onChange={e=>setPreviewName(e.target.value)} />
                </label>

                <label className="field">
                  Frase breve
                  <input name="tagline" defaultValue={settings.tagline ?? ''} maxLength={180} placeholder="Todo lo que necesitás, en un solo lugar" onChange={e=>setPreviewTagline(e.target.value)} />
                </label>

                <label className="field">
                  Color principal
                  <div className="color-field">
                    <input type="color" name="primaryColor" defaultValue={settings.primaryColor} onChange={e=>setPreviewPrimary(e.target.value)} />
                    <span>{previewPrimary}</span>
                  </div>
                </label>

                <label className="field">
                  Color secundario
                  <div className="color-field">
                    <input type="color" name="secondaryColor" defaultValue={settings.secondaryColor} onChange={e=>setPreviewSecondary(e.target.value)} />
                    <span>{previewSecondary}</span>
                  </div>
                </label>

                <label className="field full-field">
                  Logo desde archivo
                  <input name="logoFile" type="file" accept="image/jpeg,image/png,image/webp" />
                  <small>JPG, PNG o WebP. Máximo 2 MB.</small>
                </label>

                <label className="field full-field">
                  O URL del logo
                  <input name="logoUrl" defaultValue={settings.logoUrl ?? ''} placeholder="https://..." />
                </label>
              </div>
            </section>

            <section className="card settings-card">
              <div className="settings-card-head">
                <div><span className="settings-kicker">CONTACTO</span><h2>Datos del comercio</h2></div>
              </div>

              <div className="settings-grid">
                <label className="field">
                  WhatsApp
                  <input name="whatsapp" defaultValue={settings.whatsapp ?? ''} placeholder="5491112345678" />
                  <small>Ingresalo con código de país, sin espacios ni símbolos.</small>
                </label>
                <label className="field">
                  Teléfono
                  <input name="contactPhone" defaultValue={settings.contactPhone ?? ''} />
                </label>
                <label className="field">
                  Email de contacto
                  <input name="contactEmail" type="email" defaultValue={settings.contactEmail ?? ''} />
                </label>
                <label className="field">
                  Dirección
                  <input name="address" defaultValue={settings.address ?? ''} />
                </label>
                <label className="field full-field">
                  Horarios
                  <textarea name="businessHours" rows={4} defaultValue={settings.businessHours ?? ''} placeholder={"Lunes a viernes: 9 a 18 hs\nSábados: 9 a 13 hs"} />
                </label>
              </div>
            </section>

            <section className="card settings-card">
              <div className="settings-card-head">
                <div><span className="settings-kicker">ENTREGA</span><h2>Modalidades disponibles</h2></div>
              </div>
              <div className="delivery-settings">
                <label>
                  <input type="checkbox" name="pickupEnabled" defaultChecked={settings.pickupEnabled} />
                  <span><strong>Retiro por el comercio</strong><small>El cliente puede retirar su pedido.</small></span>
                </label>
                <label>
                  <input type="checkbox" name="shippingEnabled" defaultChecked={settings.shippingEnabled} />
                  <span><strong>Envío a domicilio</strong><small>El cliente puede cargar una dirección.</small></span>
                </label>
              </div>
            </section>

            <button className="btn primary settings-save" type="submit" disabled={saving}>
              {saving?'Guardando...':'Guardar configuración'}
            </button>
          </div>

          <aside className="card settings-preview">
            <span className="settings-kicker">VISTA PREVIA</span>
            <div className="preview-store" style={{'--preview-primary':previewPrimary,'--preview-secondary':previewSecondary} as React.CSSProperties}>
              <div className="preview-top">
                {logoSrc?<img src={logoSrc} alt="" />:<span>{(previewName || 'T').charAt(0).toUpperCase()}</span>}
                <div><strong>{previewName || 'Tu comercio'}</strong><small>{previewTagline || 'Tu tienda online'}</small></div>
              </div>
              <div className="preview-hero">
                <small>TU MARCA. TU TIENDA.</small>
                <h3>{previewName || 'Tu comercio'}</h3>
                <p>{previewTagline || 'Una experiencia de compra personalizada para tus clientes.'}</p>
                <button type="button">Ver productos</button>
              </div>
              <div className="preview-products">
                <div></div><div></div><div></div>
              </div>
            </div>
            <p className="preview-note">Los cambios se aplican automáticamente a la tienda pública después de guardar.</p>
          </aside>
        </form>
      )}
    </main>
  );
}
