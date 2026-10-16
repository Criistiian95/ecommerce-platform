import { API_URL } from './storefront-types';
export const storeCovers = [
  {id:'oak', name:'Roble natural', src:'/covers/oak.webp'},
  {id:'workshop', name:'Taller artesanal', src:'/covers/workshop.webp'},
  {id:'home', name:'Calidez de hogar', src:'/covers/home.webp'},
];
export function storeCover(commerce:{coverPreset?:string;hasUploadedCover?:boolean;slug:string;updatedAt?:string}) {
  if(commerce.coverPreset==='custom' && commerce.hasUploadedCover) return `${API_URL}/catalog/store/${encodeURIComponent(commerce.slug)}/cover?v=${encodeURIComponent(commerce.updatedAt||'')}`;
  return storeCovers.find(c=>c.id===commerce.coverPreset)?.src || '';
}
