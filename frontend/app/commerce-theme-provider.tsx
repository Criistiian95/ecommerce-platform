'use client';

import { onColor } from './store-colors';
import { storeFont } from './store-fonts';
import { useEffect } from 'react';
import { API_URL, StoreCatalog } from './storefront-types';
import { useStorefront } from './storefront-context';

export function CommerceThemeProvider({ children }:{ children:React.ReactNode }){
  const { slug: COMMERCE_SLUG } = useStorefront();
  useEffect(()=>{
    const controller=new AbortController();

    fetch(`${API_URL}/catalog/store/${COMMERCE_SLUG}`,{signal:controller.signal})
      .then(async response=>{
        if(!response.ok) throw new Error();
        const catalog:StoreCatalog=await response.json();
        const root=document.documentElement;
        root.style.setProperty('--store-font',storeFont(catalog.commerce.fontFamily));
        root.style.setProperty('--store-background',catalog.commerce.backgroundColor || '#f7f9fd');
        root.style.setProperty('--on-accent',onColor(catalog.commerce.primaryColor || '#245ce6'));
        root.style.setProperty('--accent',catalog.commerce.primaryColor || '#245ce6');
        root.style.setProperty('--ink',catalog.commerce.secondaryColor || '#172238');
      })
      .catch(()=>null);

    return ()=>{
      controller.abort();
      const root=document.documentElement;
      root.style.removeProperty('--store-font');
      root.style.removeProperty('--store-background');
      root.style.removeProperty('--on-accent');
      root.style.removeProperty('--accent');
      root.style.removeProperty('--ink');
    };
  },[]);

  return <>{children}</>;
}
