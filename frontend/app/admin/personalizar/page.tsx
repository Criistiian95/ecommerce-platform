'use client';
import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import styles from './personalizar.module.css';
import { API_URL } from '../../storefront-types';
import { useStorefront } from '../../storefront-context';

type Design={fontFamily:string;name:string;tagline:string;primaryColor:string;secondaryColor:string;logoUrl:string};
type Settings=Design & {slug:string;hasUploadedLogo:boolean;updatedAt?:string};
const palettes=[['Bosque','#237059','#172522'],['Madera','#865735','#33291f'],['Océano','#245ce6','#172238'],['Ciruela','#793e76','#302136']];
export default function Personalizar(){
  const {isTenantDomain}=useStorefront();
  const frame=useRef<HTMLIFrameElement>(null);
  const fileInput=useRef<HTMLInputElement>(null);
  const [token,setToken]=useState('');const [loaded,setLoaded]=useState(false);
  const [settings,setSettings]=useState<Settings|null>(null);
  const [design,setDesign]=useState<Design|null>(null);
  const [baseline,setBaseline]=useState('');
  const [ready,setReady]=useState(0);const [mobile,setMobile]=useState(false);
  const [saving,setSaving]=useState(false);const [reading,setReading]=useState(false);
  const [message,setMessage]=useState('');const [error,setError]=useState('');
  const dirty=!!design && JSON.stringify(design)!==baseline;
  function accept(data:Settings){
    const next={fontFamily:data.fontFamily||'modern',name:data.name,tagline:data.tagline||'',primaryColor:data.primaryColor,secondaryColor:data.secondaryColor,logoUrl:data.hasUploadedLogo?`${API_URL}/catalog/store/${encodeURIComponent(data.slug)}/logo?v=${encodeURIComponent(data.updatedAt||'')}`:data.logoUrl||''};
    setSettings(data);setDesign(next);setBaseline(JSON.stringify(next));
  }
  async function load(auth:string){
    try{const r=await fetch(`${API_URL}/admin/commerce/settings`,{headers:{Authorization:`Bearer ${auth}`},cache:'no-store'});if(!r.ok)throw Error('No se pudo cargar tu tienda. Verificá tu sesión de administrador.');accept(await r.json());setError('');}
    catch(e){setError(e instanceof Error?e.message:'No se pudo cargar la tienda.');}
  }
  useEffect(()=>{const auth=localStorage.getItem('ecommerce_token')||'';setToken(auth);setLoaded(true);if(auth)void load(auth);},[]);
  useEffect(()=>{const receive=(e:MessageEvent)=>{if(e.origin===window.location.origin && e.source===frame.current?.contentWindow && e.data?.type==='disenolys-preview-ready')setReady(n=>n+1)};window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);},[]);
  useEffect(()=>{if(design)frame.current?.contentWindow?.postMessage({type:'disenolys-design',design},window.location.origin);},[design,ready]);
  useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  function change(key:keyof Design,value:string){setDesign(d=>d?{...d,[key]:value}:d);setMessage('');}
  async function upload(file?:File){
    if(!file)return;setError('');
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2*1024*1024){setError('Elegí un logo PNG, JPG o WebP de hasta 2 MB.');return;}
    setReading(true);
    try{const data=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onerror=()=>reject(Error('No se pudo leer el logo.'));r.onload=()=>resolve(String(r.result));r.readAsDataURL(file);});await new Promise<void>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve();img.onerror=()=>reject(Error('La imagen está dañada.'));img.src=data;});change('logoUrl',data);}
    catch(e){setError(e instanceof Error?e.message:'No se pudo cargar el logo.');}finally{setReading(false);}
  }
  async function save(e:FormEvent){
    e.preventDefault();if(!design||!settings)return;setSaving(true);setError('');setMessage('');
    try{
      const {logoUrl,...brand}=design;const old=JSON.parse(baseline) as Design;
      let logo:{}={};
      if(logoUrl!==old.logoUrl){
        const data=logoUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
        logo=data?{logoDataBase64:data[2],logoMimeType:data[1]}:{logoUrl:logoUrl||null,clearUploadedLogo:true};
      }
      const r=await fetch(`${API_URL}/admin/commerce/settings`,{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({...brand,...logo})});
      const data=await r.json();if(!r.ok)throw Error(typeof data.message==='string'?data.message:'No se pudo guardar.');accept(data);if(fileInput.current)fileInput.current.value='';setMessage('Diseño guardado. Ya está aplicado a tu tienda.');
    }catch(e){setError(e instanceof Error?e.message:'No se pudo guardar. Tus cambios siguen en la vista previa.');}finally{setSaving(false);}
  }
  if(!loaded)return <main className="shell">Cargando…</main>;
  if(!token)return <main className="shell"><h1>Personalizar mi tienda</h1><p>Ingresá con tu cuenta de administrador.</p><Link href="/login">Iniciar sesión</Link></main>;
  const storePath=isTenantDomain?'/':`/tienda/${encodeURIComponent(settings?.slug||'')}`;
  return <main className={styles.page}>
    <header className={styles.header}><Link href="/admin/dashboard">← Panel del comercio</Link><strong>DISEÑOLYS</strong><Link href="/admin/configuracion">Configuración y cobros</Link></header>
    <div className={styles.heading}><span>TU MARCA, TU TIENDA</span><h1>Personalizar mi tienda</h1><p>Probá tu logo y tus colores sobre tu catálogo real. Publicá el diseño cuando esté listo.</p></div>
    {error&&<p className={styles.error} role="alert">{error}</p>}{message&&<p className={styles.success} role="status">{message}</p>}
    {!design?<div><p>Cargando tu tienda…</p>{error&&<button onClick={()=>load(token)}>Reintentar</button>}</div>:<div className={styles.workspace}>
      <form onSubmit={save} className={styles.editor}><fieldset disabled={saving||reading}>
        <h2>Identidad del comercio</h2><label>Nombre comercial<input required maxLength={120} value={design.name} onChange={e=>change('name',e.target.value)}/></label>
        <label>Texto de portada<textarea maxLength={180} rows={3} value={design.tagline} onChange={e=>change('tagline',e.target.value)}/></label>
        <label>Logo de tu comercio<input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void upload(e.target.files?.[0])}/></label><small>PNG, JPG o WebP · Hasta 2 MB</small>
        {design.logoUrl&&<div className={styles.logo}><img src={design.logoUrl} alt="Vista previa del logo"/><button type="button" onClick={()=>{change('logoUrl','');if(fileInput.current)fileInput.current.value='';}}>Quitar logo</button></div>}
        <label>O usar una URL del logo<input type="url" placeholder="https://..." value={design.logoUrl.startsWith('data:')?'':design.logoUrl} onChange={e=>change('logoUrl',e.target.value)}/></label>
        <label>Tipo de letra<select value={design.fontFamily} onChange={e=>change('fontFamily',e.target.value)}><option value="modern">Moderna · Arial</option><option value="classic">Clásica · Georgia</option><option value="friendly">Cercana · Trebuchet</option><option value="mono">Monoespaciada · Courier</option></select></label>
        <div className={styles.colors}><label>Color principal<input type="color" value={design.primaryColor} onChange={e=>change('primaryColor',e.target.value)}/></label><label>Color del texto<input type="color" value={design.secondaryColor} onChange={e=>change('secondaryColor',e.target.value)}/></label></div>
        <div className={styles.palettes}>{palettes.map(([name,primaryColor,secondaryColor])=><button type="button" key={name} onClick={()=>{setDesign({...design,primaryColor,secondaryColor});setMessage('');}}><i style={{background:primaryColor}}/>{name}</button>)}</div>
        <p className={styles.note}>{dirty?'Tenés cambios sin guardar.':'Tu diseño está guardado.'}</p>
        <button className={styles.save} disabled={!dirty} type="submit">{saving?'Guardando…':reading?'Cargando logo…':'Guardar cambios en mi tienda'}</button>
        <button type="button" disabled={!dirty} onClick={()=>{setDesign(JSON.parse(baseline));setError('');setMessage('');if(fileInput.current)fileInput.current.value='';}}>Descartar cambios</button>
      </fieldset></form>
      <section className={styles.preview}><div className={styles.toolbar}><strong>Vista previa de tu tienda</strong><div><button type="button" aria-pressed={!mobile} onClick={()=>setMobile(false)}>Computadora</button><button type="button" aria-pressed={mobile} onClick={()=>setMobile(true)}>Celular</button></div></div>
        <div className={styles.frameWrap}><iframe ref={frame} onLoad={()=>setReady(n=>n+1)} title="Vista previa de la tienda real" src={`${storePath}?personalizar=1`} className={mobile?styles.mobile:styles.desktop} tabIndex={-1}/></div>
        <p className={styles.note}>Desplazá la vista previa para ver artículos y botones. Los botones de compra están desactivados en esta vista.</p><a href={storePath} target="_blank" rel="noreferrer">Abrir mi tienda publicada ↗</a>
      </section>
    </div>}
  </main>;
}
