import {BadRequestException,Injectable,ServiceUnavailableException} from '@nestjs/common';
import {Commerce} from '../database/models/commerce.model';
import {BillingSubscription} from '../database/models/billing-subscription.model';
import {BillingPayment} from '../database/models/billing-payment.model';
import {BILLING_MONTHLY_ARS,nextPaidThrough} from './billing-rules';
import {DatabaseService} from '../database/database.service';

@Injectable()
export class BillingService {
 constructor(private readonly db:DatabaseService){}
 private token(){const token=process.env.MP_SUBSCRIPTIONS_ACCESS_TOKEN; if(!token) throw new ServiceUnavailableException('Falta configurar Mercado Pago de Diseñolys');return token;}
 private async mp(path:string,options:RequestInit={}):Promise<any> {
  const res=await fetch('https://api.mercadopago.com'+path,{...options,signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+this.token(),Accept:'application/json',...options.headers}});
  const data=await res.json().catch(()=>null);
  if(!res.ok) throw new ServiceUnavailableException('No se pudo verificar la suscripción con Mercado Pago');
  return data;
 }
 async createMerchantSubscription(commerceId:string,payerEmail:string) {
  const commerce=await Commerce.findByPk(commerceId);
  if(!commerce || commerce.active) throw new BadRequestException('Comercio no elegible para el alta');
  const current=await BillingSubscription.findByPk(commerceId);
  if(current?.checkoutUrl && current.mpSubscriptionId) return {checkoutUrl:current.checkoutUrl,status:current.status};
  if(current?.mpSubscriptionId) throw new ServiceUnavailableException('La suscripción requiere revisión');
  const url=(process.env.FRONTEND_URL||'').replace(/\/$/,'');
  if(!url.startsWith('https://')) throw new ServiceUnavailableException('FRONTEND_URL debe ser HTTPS');
  if(!/^https:\/\/[^\s/]+\/billing\/webhook$/.test((process.env.BILLING_WEBHOOK_URL||'').trim())) throw new ServiceUnavailableException('BILLING_WEBHOOK_URL inválida o sin configurar');
  const body={reason:'Diseñolys - Tienda Online',external_reference:commerce.id,payer_email:payerEmail,
   auto_recurring:{frequency:1,frequency_type:'months',transaction_amount:BILLING_MONTHLY_ARS,currency_id:'ARS'},
   back_url:url+'/registro/resultado',notification_url:(process.env.BILLING_WEBHOOK_URL||'').trim(),status:'pending'};
  const result=await this.mp('/preapproval',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const owner=await this.mp('/users/me');
  if(String(result.collector_id)!==String(owner.id)) throw new ServiceUnavailableException('La suscripción apunta a otra cuenta receptora');
  if(!result.id||!result.init_point||!/^https:\/\//.test(result.init_point)||
    String(result.external_reference)!==commerce.id||Number(result.auto_recurring?.transaction_amount)!==BILLING_MONTHLY_ARS)
    throw new ServiceUnavailableException('La respuesta de Mercado Pago requiere revisión');
  await BillingSubscription.create({commerceId,payerEmail,mpSubscriptionId:String(result.id),checkoutUrl:result.init_point,
    amountArs:BILLING_MONTHLY_ARS,status:'pending',paidThrough:null,startedAt:null});
  return {checkoutUrl:result.init_point,status:'pending'};
 }
 async reconcileOverdue() {
  const {Op}=await import('sequelize');
  const cutoff=new Date(Date.now()-7*24*60*60*1000);
  const due=await BillingSubscription.findAll({where:{paidThrough:{[Op.lt]:cutoff}},limit:25,order:[['paidThrough','ASC']]});
  for(const row of due){
   if(!row.mpSubscriptionId) continue;
   try {
    const params=new URLSearchParams({preapproval_id:row.mpSubscriptionId,limit:'100'});
    const list=await this.mp('/authorized_payments/search?'+params.toString());
    if(!Array.isArray(list.results)||!Number.isFinite(Number(list.paging?.total))||
      Number(list.paging.total)>list.results.length) continue;
    for(const invoice of list.results){
     if(invoice.payment?.status==='approved' && invoice.id) await this.settleAuthorizedPayment(String(invoice.id));
    }
    await this.db.sequelize.transaction(async transaction=>{
     const fresh=await BillingSubscription.findByPk(row.commerceId,{transaction,lock:transaction.LOCK.UPDATE});
     if(!fresh?.paidThrough || fresh.paidThrough>=cutoff) return;
     await fresh.update({status:'past_due'},{transaction});
     await Commerce.update({active:false},{where:{id:fresh.commerceId},transaction});
    });
   }catch(error){console.error('Billing reconciliation failed for commerce',row.commerceId);}
  }
 }
 async subscription(commerceId:string){
  const billing=await BillingSubscription.findByPk(commerceId);
  return billing?{status:billing.status,amountArs:billing.amountArs,paidThrough:billing.paidThrough,checkoutUrl:billing.checkoutUrl}:null;
 }
 async verifySubscription(mpId:string){
  if(!/^[a-z0-9-]{5,100}$/i.test(mpId)) throw new BadRequestException('ID inválido');
  const remote=await this.mp('/preapproval/'+encodeURIComponent(mpId));
  const billing=await BillingSubscription.findOne({where:{mpSubscriptionId:mpId}});
  if(!billing || String(remote.id)!==mpId || String(remote.external_reference)!==billing.commerceId || remote.status!=='authorized' || remote.payer_email?.toLowerCase()!==billing.payerEmail.toLowerCase() ||
     remote.auto_recurring?.currency_id!=='ARS' || Number(remote.auto_recurring?.transaction_amount)!==billing.amountArs ||
     remote.auto_recurring?.frequency!==1 || remote.auto_recurring?.frequency_type!=='months') return {verified:false};
  // Authorization alone does not prove a successful debit: activation is exclusively tied to verified payment.
  return {verified:true,paidThrough:billing.paidThrough};
 }
 async settleAuthorizedPayment(invoiceId:string) {
  if(!/^\d{1,30}$/.test(invoiceId)) throw new BadRequestException('Identificador de cobro inválido');
  const invoice=await this.mp('/authorized_payments/'+invoiceId);
  const subId=String(invoice.preapproval_id||'');
  if(!subId) return {processed:false};
  const sub=await BillingSubscription.findOne({where:{mpSubscriptionId:subId}});
  if(!sub) return {processed:false};
  const subscription=await this.mp('/preapproval/'+encodeURIComponent(subId));
  if(subscription.status!=='authorized' || String(subscription.external_reference)!==sub.commerceId || subscription.payer_email?.toLowerCase()!==sub.payerEmail.toLowerCase() ||
     subscription.auto_recurring?.currency_id!=='ARS'||Number(subscription.auto_recurring?.transaction_amount)!==BILLING_MONTHLY_ARS ||
     subscription.auto_recurring?.frequency!==1 || subscription.auto_recurring?.frequency_type!=='months') return {processed:false};
  // Subscription authorization and authorized-payment authorization are different states.
  if(String(invoice.external_reference)!==sub.commerceId || invoice.currency_id!=='ARS' || Number(invoice.transaction_amount)!==BILLING_MONTHLY_ARS || invoice.payment?.status!=='approved') return {processed:false};
  const paymentId=String(invoice.payment?.id||invoice.payment_id||'');
  if(!/^\d+$/.test(paymentId)) return {processed:false};
  const payment=await this.mp('/v1/payments/'+paymentId);
  if(payment.status!=='approved'||payment.currency_id!=='ARS'||Number(payment.transaction_amount)!==BILLING_MONTHLY_ARS ||
     String(payment.id)!==paymentId) return {processed:false};
  const owner=await this.mp('/users/me');
  if(String(subscription.collector_id)!==String(owner.id)) return {processed:false};
  if(String(payment.collector_id)!==String(owner.id)) return {processed:false};
  const approved=new Date(payment.date_approved||0);
  if(!Number.isFinite(approved.getTime())||approved>new Date()) return {processed:false};
  const result=await this.db.sequelize.transaction(async transaction=>{
    const locked=await BillingSubscription.findByPk(sub.commerceId,{transaction,lock:transaction.LOCK.UPDATE});
    if(!locked || locked.mpSubscriptionId!==subId) return false;
    if(await BillingPayment.findOne({where:{mpInvoiceId:invoiceId},transaction})) return false;
    await BillingPayment.create({commerceId:locked.commerceId,mpInvoiceId:invoiceId,mpPaymentId:paymentId,approvedAt:approved},{transaction});
    const paidThrough=nextPaidThrough(locked.paidThrough,approved);
    await locked.update({status:'active',paidThrough,startedAt:locked.startedAt||approved},{transaction});
    await Commerce.update({active:true},{where:{id:locked.commerceId},transaction});
    return true;
  });
  return {processed:result};
 }
}
