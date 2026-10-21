import {createHmac,timingSafeEqual} from 'crypto';
export const BILLING_MONTHLY_ARS = 39900;
export const BILLING_GRACE_DAYS = 7;
export function addCalendarMonth(date:Date):Date {
 const result = new Date(date); const day=result.getUTCDate();
 result.setUTCDate(1); result.setUTCMonth(result.getUTCMonth()+1);
 const nextMonth=new Date(Date.UTC(result.getUTCFullYear(),result.getUTCMonth()+1,0)).getUTCDate();
 result.setUTCDate(Math.min(day,nextMonth)); return result;
}
export function nextPaidThrough(previous:Date|null, approved:Date):Date {
 return addCalendarMonth(previous && previous>approved ? previous : approved);
}
export function verifyMpWebhook(secret:string, signature:string, requestId:string, dataId:string):boolean {
 if(!secret||!signature||!requestId||!dataId) return false;
 const pairs=Object.fromEntries(signature.split(',').map(part=>part.trim().split('=')));
 if(!/^\d+$/.test(pairs.ts||'')||!/^[a-f0-9]{64}$/i.test(pairs.v1||'')) return false;
 const now=Math.floor(Date.now()/1000), ts=Number(pairs.ts);
 if(!Number.isFinite(ts)||Math.abs(now-ts)>60*60) return false;
 const manifest='id:'+dataId.toLowerCase()+';request-id:'+requestId+';ts:'+pairs.ts+';';
 const expected=createHmac('sha256',secret).update(manifest).digest();
 return timingSafeEqual(expected,Buffer.from(pairs.v1,'hex'));
}
