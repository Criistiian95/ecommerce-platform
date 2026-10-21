'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useStorefront} from './storefront-context';

/** Admin sessions live on the central domain; never copy tokens into tenant URLs. */
export default function StoreAdminAccess(){
 const {isTenantDomain}=useStorefront();
 const [url,setUrl]=useState('/login');
 const [label,setLabel]=useState('Acceso para comercios');
 useEffect(()=>{
  const mainHost=process.env.NEXT_PUBLIC_PLATFORM_HOST?.trim() || 'disenolys.store';
  if(isTenantDomain){
   setUrl(`https://${mainHost}/admin/dashboard`);
   setLabel('Panel del comercio');
   return;
  }
  const hasSession=Boolean(localStorage.getItem('ecommerce_token'));
  setUrl(hasSession?'/admin/dashboard':'/login');
  setLabel(hasSession?'Ir al dashboard':'Acceso para comercios');
 },[isTenantDomain]);
 return <Link href={url}>{label}</Link>;
}
