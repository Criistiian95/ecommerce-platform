'use client';

import { useEffect } from 'react';
import { API_URL, StoreCatalog } from './storefront-types';
import { COMMERCE_SLUG } from './storefront-config';

export function CommerceThemeProvider({ children }:{ children:React.ReactNode }){
  useEffect(()=>{
    const controller=new AbortController();

    fetch(`${API_URL}/catalog/store/${COMMERCE_SLUG}`,{signal:controller.signal})
      .then(async response=>{
        if(!response.ok) throw new Error();
        const catalog:StoreCatalog=await response.json();
        const root=document.documentElement;
        root.style.setProperty('--accent',catalog.commerce.primaryColor || '#245ce6');
        root.style.setProperty('--ink',catalog.commerce.secondaryColor || '#172238');
      })
      .catch(()=>null);

    return ()=>{
      controller.abort();
      const root=document.documentElement;
      root.style.removeProperty('--accent');
      root.style.removeProperty('--ink');
    };
  },[]);

  return <>{children}</>;
}
