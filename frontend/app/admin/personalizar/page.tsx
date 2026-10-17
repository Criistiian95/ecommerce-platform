'use client';
import Link from 'next/link';
import { transparentLogo } from '../../logo-background';
import { storeCovers, storeCover } from '../../store-covers';
import { FormEvent, useEffect, useRef, useState } from 'react';
import styles from './personalizar.module.css';
import { API_URL } from '../../storefront-types';
import { useStorefront } from '../../storefront-context';

type Design={accountDisplay:string;whatsapp:string;instagramUrl:string;facebookUrl:string;tiktokUrl:string;youtubeUrl:string;heroTitle:string;heroButtonText:string;announcementText:string;heroLayout:string;backgroundColor:string;coverPreset:string;coverUrl:string;fontFamily:string;name:string;tagline:string;headerTagline:string;headerDisplay:string;primaryColor:string;secondaryColor:string;logoUrl:string};
type Settings=Design & {slug:string;hasUploadedLogo:boolean;hasUploadedCover:boolean;updatedAt?:string};
const palettes=[
  ['Roble','#987042','#332b22','#faf5eb'],
  ['Nogal','#73513c','#302620','#f5efe8'],
  ['Cedro','#a35234','#3b2924','#fbf0e8'],
  ['Arena','#86704b','#34312b','#faf7ef'],
  ['Oliva','#62724a','#293225','#f4f5ed'],
  ['Bosque','#237059','#172f28','#f0f6f2'],
  ['Terracota','#b04d3b','#442b29','#fcf2ed'],
  ['Océano','#245ce6','#172238','#f4f7ff'],
  ['Petróleo','#166779','#17323a','#edf6f7'],
  ['Ciruela','#793e76','#302136','#faf2f9'],
  ['Rosa','#b63867','#432434','#fff3f7'],
  ['Grafito','#48515c','#20252c','#f4f5f6'],
];
export default function Personalizar(){
  const {isTenantDomain}=useStorefront();
  const frame=useRef<HTMLIFrameElement>(null);
  const coverInput=useRef<HTMLInputElement>(null);
  const fileInput=useRef<HTMLInputElement>(null);
  const [token,setToken]=useState('');const [loaded,setLoaded]=useState(false);
  const [settings,setSettings]=useState<Settings|null>(null);
  const [design,setDesign]=useState<Design|null>(null);
  const [baseline,setBaseline]=useState('');
  const [ready,setReady]=useState(0);const [mobile,setMobile]=useState(false);
  const [saving,setSaving]=useState(false);const [reading,setReading]=useState(false);
  const [logoOriginal,setLogoOriginal]=useState('');const [logoTolerance,setLogoTolerance]=useState(32);const [logoInside,setLogoInside]=useState(false);
  const [message,setMessage]=useState('');const [error,setError]=useState('');
  const dirty=!!design && JSON.stringify(design)!==baseline;
  function accept(data:Settings){
    const next={accountDisplay:data.accountDisplay||'icon',whatsapp:data.whatsapp||'',instagramUrl:data.instagramUrl||'',facebookUrl:data.facebookUrl||'',tiktokUrl:data.tiktokUrl||'',youtubeUrl:data.youtubeUrl||'',heroTitle:data.heroTitle||'',heroButtonText:data.heroButtonText||'',announcementText:data.announcementText||'',heroLayout:data.heroLayout||'split',backgroundColor:data.backgroundColor||'#f7f9fd',coverPreset:data.coverPreset||'none',coverUrl:storeCover(data),fontFamily:data.fontFamily||'modern',name:data.name,tagline:data.tagline||'',headerTagline:data.headerTagline??data.tagline??'',headerDisplay:data.headerDisplay||'logo',primaryColor:data.primaryColor,secondaryColor:data.secondaryColor,logoUrl:data.hasUploadedLogo?`${API_URL}/catalog/store/${encodeURIComponent(data.slug)}/logo?v=${encodeURIComponent(data.updatedAt||'')}`:data.logoUrl||''};
    setLogoOriginal('');setSettings(data);setDesign(next);setBaseline(JSON.stringify(next));
  }
  async function load(auth:string){
    try{const r=await fetch(`${API_URL}/admin/commerce/settings`,{headers:{Authorization:`Bearer ${auth}`},cache:'no-store'});if(!r.ok)throw Error('No se pudo cargar tu tienda. Verificá tu sesión de administrador.');accept(await r.json());setError('');}
    catch(e){setError(e instanceof Error?e.message:'No se pudo cargar la tienda.');}
  }
  useEffect(()=>{const auth=localStorage.getItem('ecommerce_token')||'';setToken(auth);setLoaded(true);if(auth)void load(auth);},[]);
  useEffect(()=>{const receive=(e:MessageEvent)=>{if(e.origin===window.location.origin && e.source===frame.current?.contentWindow && e.data?.type==='disenolys-preview-ready')setReady(n=>n+1)};window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);},[]);
  useEffect(()=>{if(design)frame.current?.contentWindow?.postMessage({type:'disenolys-design',design},window.location.origin);},[design,ready]);
  useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  function change(key:keyof Design,value:string){if(key==='logoUrl')setLogoOriginal('');setDesign(d=>d?{...d,[key]:value}:d);setMessage('');}
  async function upload(file:File|undefined,kind:'logo'|'cover'='logo'){
    if(!file)return;setError('');
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2*1024*1024){setError('Elegí una imagen PNG, JPG o WebP de hasta 2 MB.');return;}
    setReading(true);
    try{const data=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onerror=()=>reject(Error('No se pudo leer el logo.'));r.onload=()=>resolve(String(r.result));r.readAsDataURL(file);});await new Promise<void>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve();img.onerror=()=>reject(Error('La imagen está dañada.'));img.src=data;});if(kind==='cover'){setDesign(d=>d?{...d,coverPreset:'custom',coverUrl:data}:d);setMessage('');}else change('logoUrl',data);}
    catch(e){setError(e instanceof Error?e.message:'No se pudo cargar el logo.');}finally{setReading(false);}
  }
  async function removeLogoBackground(){
    if(!design?.logoUrl)return;setReading(true);setError('');
    const source=logoOriginal||design.logoUrl;
    try{const result=await transparentLogo(source,logoTolerance,logoInside);setLogoOriginal(source);setDesign(d=>d?{...d,logoUrl:result}:d);setMessage('Revisá el recorte en la vista previa. Podés deshacerlo antes de guardar.');}
    catch(e){setError(e instanceof Error?e.message:'No se pudo quitar el fondo.');}finally{setReading(false);}
  }
  async function save(e:FormEvent){
    e.preventDefault();if(!design||!settings)return;setSaving(true);setError('');setMessage('');
    try{
      const {logoUrl,coverUrl,...brand}=design;const old=JSON.parse(baseline) as Design;
      let logo:{}={};
      if(logoUrl!==old.logoUrl){
        const data=logoUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
        logo=data?{logoDataBase64:data[2],logoMimeType:data[1]}:{logoUrl:logoUrl||null,clearUploadedLogo:true};
      }
      let cover:{}={};
      if(design.coverPreset==='custom' && coverUrl!==old.coverUrl){
        const data=coverUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
        if(!data)throw Error('Volvé a seleccionar la imagen de portada.');
        cover={coverDataBase64:data[2],coverMimeType:data[1]};
      }
      const r=await fetch(`${API_URL}/admin/commerce/settings`,{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({...brand,...logo,...cover})});
      const data=await r.json();if(!r.ok)throw Error(typeof data.message==='string'?data.message:'No se pudo guardar.');accept(data);if(fileInput.current)fileInput.current.value='';if(coverInput.current)coverInput.current.value='';setMessage('Diseño guardado. Ya está aplicado a tu tienda.');
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
        <label>Frase debajo del logo<input maxLength={180} value={design.headerTagline} placeholder="Tu idea, hecha en madera" onChange={e=>change('headerTagline',e.target.value)}/></label><small>Es independiente de la descripción de portada y se muestra bajo el logo.</small><label>Identidad del encabezado<select value={design.headerDisplay} onChange={e=>change('headerDisplay',e.target.value)}><option value="logo">Solo logo y frase</option><option value="logo-name">Logo, nombre y frase</option></select></label><h2>Cuenta de clientes</h2>
        <label>Mostrar acceso a la cuenta<select value={design.accountDisplay} onChange={e=>change('accountDisplay',e.target.value)}><option value="icon">Ícono de persona</option><option value="text">Palabra «Cuenta»</option></select></label>
        <small>Al pasar el mouse o tocarlo, se abre el menú para ingresar o crear una cuenta.</small>
        <h2>Redes sociales y WhatsApp</h2>
        <p className={styles.note}>Solo se muestran los canales que completes. Borrá un campo para ocultarlo.</p>
        <label>WhatsApp / WhatsApp Business<input type="tel" maxLength={60} placeholder="5491112345678" value={design.whatsapp} onChange={e=>change('whatsapp',e.target.value)}/></label>
        <small>Ingresá el número con código de país. Para un celular argentino: 549 + código de área + número, sin el 15. Abre el chat del número indicado, también si usa Business.</small>
        {([['instagramUrl','Instagram','https://www.instagram.com/tucomercio'],['facebookUrl','Facebook','https://www.facebook.com/tucomercio'],['tiktokUrl','TikTok','https://www.tiktok.com/@tucomercio'],['youtubeUrl','YouTube','https://www.youtube.com/@tucomercio']] as const).map(([key,label,placeholder])=><label key={key}>{label}<input type="url" maxLength={500} placeholder={placeholder} value={design[key]} onChange={e=>change(key,e.target.value)}/></label>)}
        <h2>Textos de tu tienda</h2>
        <label>Título principal de portada<textarea rows={3} maxLength={180} placeholder={`Todo lo que buscás,\nen ${design.name}.`} value={design.heroTitle} onChange={e=>change('heroTitle',e.target.value)}/></label>
        <small>Podés escribir el título completo y usar saltos de línea. Vacío usa el título automático.</small>
        <label>Texto del botón principal<input maxLength={40} placeholder="Ver productos" value={design.heroButtonText} onChange={e=>change('heroButtonText',e.target.value)}/></label>
        <label>Franja de anuncios<input maxLength={160} placeholder={`${design.name.toUpperCase()} · TIENDA ONLINE`} value={design.announcementText} onChange={e=>change('announcementText',e.target.value)}/></label>
        <label>Descripción de portada<textarea maxLength={180} rows={3} value={design.tagline} onChange={e=>change('tagline',e.target.value)}/></label>
        <label>Logo de tu comercio<input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void upload(e.target.files?.[0])}/></label><small>PNG, JPG o WebP · Hasta 2 MB</small>
        {design.logoUrl&&<div className={styles.logo}><img src={design.logoUrl} alt="Vista previa del logo"/><button type="button" onClick={()=>{change('logoUrl','');if(fileInput.current)fileInput.current.value='';}}>Quitar logo</button></div>}
        {design.logoUrl&&<details className={styles.logoTools}><summary>Quitar fondo del logo</summary><p>Detecta fondos uniformes y conserva la transparencia. Para fondos con fotos o texturas, usá una versión PNG sin fondo.</p><label>Sensibilidad: {logoTolerance}<input type="range" min="12" max="100" value={logoTolerance} onChange={e=>setLogoTolerance(Number(e.target.value))}/></label><label className={styles.check}><input type="checkbox" checked={logoInside} onChange={e=>setLogoInside(e.target.checked)}/>Quitar también ese color dentro del logo</label><button type="button" onClick={()=>void removeLogoBackground()}>Detectar y quitar fondo</button>{logoOriginal&&<button type="button" onClick={()=>{change('logoUrl',logoOriginal);setMessage('Recorte deshecho.');}}>Restaurar logo original</button>}</details>}
        <label>O usar una URL del logo<input type="url" placeholder="https://..." value={design.logoUrl.startsWith('data:')?'':design.logoUrl} onChange={e=>change('logoUrl',e.target.value)}/></label>
        <h2>Imagen de portada</h2>
        <label>Distribución de portada<select value={design.heroLayout} onChange={e=>change('heroLayout',e.target.value)}><option value="split">Texto al lado de la imagen</option><option value="banner">Banner amplio con texto superpuesto</option></select></label>
        <p className={styles.note}>Elegí una foto propia o una imagen de ejemplo. Podés ver el resultado antes de guardar.</p>
        <label>Subir mi portada<input ref={coverInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void upload(e.target.files?.[0],'cover')}/></label>
        <small>JPG, PNG o WebP · Hasta 2 MB · Recomendamos una foto horizontal. Se adapta al tamaño de pantalla.</small>
        {design.coverPreset==='custom'&&<img className={styles.coverPreview} src={design.coverUrl} alt="Tu portada seleccionada"/>}
        <div className={styles.covers}>{storeCovers.map(cover=><button type="button" key={cover.id} aria-pressed={design.coverPreset===cover.id} onClick={()=>{setDesign({...design,coverPreset:cover.id,coverUrl:cover.src});setMessage('');if(coverInput.current)coverInput.current.value='';}}><img src={cover.src} alt=""/><span>{cover.name}</span></button>)}</div>
        <small>Imágenes decorativas de ejemplo generadas con IA. No representan trabajos del comercio.</small>
        <button type="button" aria-pressed={design.coverPreset==='none'} onClick={()=>{setDesign({...design,coverPreset:'none',coverUrl:''});setMessage('');if(coverInput.current)coverInput.current.value='';}}>Sin imagen · Portada simple</button>
        <h2>Colores y tipografía</h2>
        <label>Tipo de letra<select value={design.fontFamily} onChange={e=>change('fontFamily',e.target.value)}><option value="modern">Moderna · Arial</option><option value="classic">Clásica · Georgia</option><option value="friendly">Cercana · Trebuchet</option><option value="mono">Monoespaciada · Courier</option></select></label>
        <div className={styles.colors}><label>Color de fondo<input type="color" value={design.backgroundColor} onChange={e=>change('backgroundColor',e.target.value)}/></label><label>Color principal<input type="color" value={design.primaryColor} onChange={e=>change('primaryColor',e.target.value)}/></label><label>Color del texto<input type="color" value={design.secondaryColor} onChange={e=>change('secondaryColor',e.target.value)}/></label></div>
        <div className={styles.palettes}>{palettes.map(([name,primaryColor,secondaryColor,backgroundColor])=><button type="button" key={name} onClick={()=>{setDesign({...design,primaryColor,secondaryColor,backgroundColor});setMessage('');}}><i style={{background:primaryColor}}/><i style={{background:secondaryColor}}/><i style={{background:backgroundColor}}/>{name}</button>)}</div>
        <p className={styles.note}>{dirty?'Tenés cambios sin guardar.':'Tu diseño está guardado.'}</p>
        <button className={styles.save} disabled={!dirty} type="submit">{saving?'Guardando…':reading?'Cargando imagen…':'Guardar cambios en mi tienda'}</button>
        <button type="button" disabled={!dirty} onClick={()=>{setDesign(JSON.parse(baseline));setLogoOriginal('');if(coverInput.current)coverInput.current.value='';setError('');setMessage('');if(fileInput.current)fileInput.current.value='';}}>Descartar cambios</button>
      </fieldset></form>
      <section className={styles.preview}><div className={styles.toolbar}><strong>Vista previa de tu tienda</strong><div><button type="button" aria-pressed={!mobile} onClick={()=>setMobile(false)}>Computadora</button><button type="button" aria-pressed={mobile} onClick={()=>setMobile(true)}>Celular</button></div></div>
        <div className={styles.frameWrap}><iframe ref={frame} onLoad={()=>setReady(n=>n+1)} title="Vista previa de la tienda real" src={`${storePath}?personalizar=1`} className={mobile?styles.mobile:styles.desktop} tabIndex={-1}/></div>
        <p className={styles.note}>Desplazá la vista previa para ver artículos y botones. Los botones de compra están desactivados en esta vista.</p><a href={storePath} target="_blank" rel="noreferrer">Abrir mi tienda publicada ↗</a>
      </section>
    </div>}
  </main>;
}
