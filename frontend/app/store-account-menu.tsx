'use client';
import { useEffect, useId, useRef, useState } from 'react';
import Link from './store-link';

export default function AccountMenu({display, signedIn}:{display?:string;signedIn:boolean}) {
  const [open,setOpen]=useState(false);
  const root=useRef<HTMLDivElement>(null);
  const trigger=useRef<HTMLButtonElement>(null);
  const id=useId();
  useEffect(()=>{
    if(!open)return;
    const outside=(event:PointerEvent)=>{if(event.target instanceof Node && !root.current?.contains(event.target))setOpen(false);};
    document.addEventListener('pointerdown',outside);
    return ()=>document.removeEventListener('pointerdown',outside);
  },[open]);
  return <div ref={root} className="store-account" onPointerEnter={e=>{if(e.pointerType==='mouse')setOpen(true);}} onPointerLeave={e=>{if(e.pointerType==='mouse' && !root.current?.contains(document.activeElement))setOpen(false);}} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false);}} onKeyDown={e=>{if(e.key==='Escape'){setOpen(false);trigger.current?.focus();}}}>
    <button ref={trigger} type="button" className="store-account-trigger" aria-label="Cuenta" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(value=>!value)} onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();setOpen(true);}}}>
      {display==='text'?<span>Cuenta</span>:<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg>}
    </button>
    <div id={id} className="store-account-dropdown" hidden={!open}>
      {signedIn?<Link href="/mi-cuenta" onClick={()=>setOpen(false)}>Mi cuenta</Link>:<><Link href="/cliente/login" onClick={()=>setOpen(false)}>Ingresar</Link><Link href="/cliente/registro" onClick={()=>setOpen(false)}>Crear cuenta</Link></>}
    </div>
  </div>;
}
