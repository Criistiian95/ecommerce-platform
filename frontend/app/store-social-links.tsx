import type { StoreCatalog } from './storefront-types';

export function whatsappHref(value?:string|null) {
  const digits=(value||'').replace(/\D/g,'');
  return /^[\d+\s()-]+$/.test(value||'') && /^\d{7,15}$/.test(digits) ? `https://wa.me/${digits}` : '';
}
function socialHref(value:string|null|undefined,hosts:string[]) {
  try {
    const url=new URL(value||'');
    return url.protocol==='https:' && !url.username && !url.password && hosts.some(host=>url.hostname===host || url.hostname.endsWith('.'+host)) ? url.href : '';
  } catch {return '';}
}
export default function SocialLinks({commerce}:{commerce:StoreCatalog['commerce']}) {
  const links=[
    ['Instagram',socialHref(commerce.instagramUrl,['instagram.com'])],
    ['Facebook',socialHref(commerce.facebookUrl,['facebook.com','fb.com'])],
    ['TikTok',socialHref(commerce.tiktokUrl,['tiktok.com'])],
    ['YouTube',socialHref(commerce.youtubeUrl,['youtube.com','youtu.be'])],
    ['WhatsApp',whatsappHref(commerce.whatsapp)],
  ].filter(([,href])=>href);
  if(!links.length)return null;
  return <nav className="store-social-links" aria-label="Redes sociales y contacto">{links.map(([label,href])=><a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={`${label} de ${commerce.name} (abre en otra pestaña)`}>{label} <span aria-hidden="true">↗</span></a>)}</nav>;
}
