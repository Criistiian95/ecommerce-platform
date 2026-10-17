import { API_URL } from './storefront-types';

export const coverGroups = ['Todas', 'Hogar y decoración', 'Moda', 'Tecnología', 'Otros rubros'] as const;
export type CoverGroup = (typeof coverGroups)[number];

type StoreCover = {
  id: string;
  name: string;
  group: Exclude<CoverGroup, 'Todas'>;
  src: string;
  thumbnail: string;
  creditUrl?: string;
};

// Use stable Unsplash photo IDs, not query-based/random images. The browser
// downloads optimized thumbnails in the editor and larger hero photographs
// only when selected. The three original covers remain local assets.
const unsplash = (photo: string, width: number) =>
  `https://images.unsplash.com/${photo}?auto=format&fit=crop&crop=entropy&w=${width}&q=${width > 600 ? 78 : 65}`;
const photoCover = (id:string,name:string,group:StoreCover['group'],photo:string,credit:string):StoreCover => ({
  id,name,group,
  src:unsplash(photo,1800),
  thumbnail:unsplash(photo,420),
  creditUrl:`https://unsplash.com/photos/${credit}`,
});

export const storeCovers: StoreCover[] = [
  { id:'oak', name:'Roble natural', group:'Hogar y decoración', src:'/covers/oak.webp', thumbnail:'/covers/oak.webp' },
  { id:'workshop', name:'Taller artesanal', group:'Hogar y decoración', src:'/covers/workshop.webp', thumbnail:'/covers/workshop.webp' },
  { id:'home', name:'Calidez de hogar', group:'Hogar y decoración', src:'/covers/home.webp', thumbnail:'/covers/home.webp' },
  photoCover('fashion','Tienda de ropa','Moda','photo-1603400521630-9f2de124b33b','clothing-racks-with-neutral-toned-garments-mwa_nzFpnJw'),
  photoCover('shoes','Calzado urbano','Moda','photo-1542291026-7eec264c27ff','white-adidas-low-top-sneakers-JM-qKEd1GMI'),
  photoCover('sports','Deporte y fitness','Moda','photo-1767552273968-da3464e2986c','gym-equipment-with-weights-and-machines-UpJkZIv4fM4'),
  photoCover('phones','Celulares','Tecnología','photo-1753108431859-19eb29905bbb','several-modern-smartphones-are-laid-out-UXk-P20Kvbw'),
  photoCover('computing','Computación y gaming','Tecnología','photo-1760999896198-b7e780e42500','gaming-setup-with-laptop-keyboard-and-rgb-lighting-Y-05vRRw3ng'),
  photoCover('appliances','Electrodomésticos','Tecnología','photo-1721396114496-26ad180b1b5b','a-kitchen-with-a-washing-machine-and-a-refrigerator-5SnHjsXHGLQ'),
  photoCover('beauty','Belleza y cosmética','Otros rubros','photo-1741896136288-b04426b65558','skincare-products-including-serums-arranged-on-pink-fGbFh23VIDU'),
  photoCover('pets','Mascotas','Otros rubros','photo-1765382119933-77efd0ee2921','a-white-cat-and-a-golden-retriever-on-stairs-h2I1mP0LOZI'),
  photoCover('organize','Organización','Hogar y decoración','photo-1685257814865-447d119a29fb','a-white-shelf-filled-with-lots-of-baskets-and-plants-c-k3u_jl9cY'),
  photoCover('hardware','Ferretería y herramientas','Otros rubros','photo-1770763233593-74dfd0da7bf0','yellow-and-black-cordless-power-drill-on-a-workbench-QvEXI1xquRY'),
  photoCover('toys','Juguetería','Otros rubros','photo-1769072385116-5712a7344c61','assorted-colorful-toys-in-a-wooden-bin-lp7wuUiOh1Q'),
  photoCover('grocery','Almacén y supermercado','Otros rubros','photo-1769499311767-bce1cf9b4549','a-grocery-store-aisle-with-fresh-produce-and-snacks-mBMl2OkGgAg'),
];

export function storeCover(commerce:{coverPreset?:string;hasUploadedCover?:boolean;slug:string;updatedAt?:string}) {
  if(commerce.coverPreset==='custom' && commerce.hasUploadedCover)
    return `${API_URL}/catalog/store/${encodeURIComponent(commerce.slug)}/cover?v=${encodeURIComponent(commerce.updatedAt||'')}`;
  return storeCovers.find(c=>c.id===commerce.coverPreset)?.src || '';
}
