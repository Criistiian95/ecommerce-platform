'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMerchantPlan } from './plan/use-merchant-plan';
import { planDate } from './plan/plan-data';
export default function TrialNotice() {
  const { data } = useMerchantPlan();
  const path = usePathname();
  if (!data?.trial || path === '/admin/plan' || path === '/admin/dashboard') return null;
  return <aside style={{background:data.trial.expired?'#fff1dd':'#e5f8ef',color:'#173b2f',padding:'14px 24px',display:'flex',gap:14,justifyContent:'center',flexWrap:'wrap',fontSize:14}} aria-label="Estado de tu prueba">
    <span>{data.trial.expired ? 'Tu prueba terminó. Podés consultar tus datos; activá el abono para seguir operando.' : `Tu prueba gratis termina el ${planDate(data.trial.endsAt, true)}. Sin cobro automático.`}</span>
    <Link href="/admin/plan" style={{fontWeight:700,textDecoration:'underline'}}>Ver mi plan →</Link>
  </aside>;
}
