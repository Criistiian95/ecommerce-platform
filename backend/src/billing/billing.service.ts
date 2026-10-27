import {BadRequestException,ConflictException,Injectable,ServiceUnavailableException} from '@nestjs/common';
import {Commerce} from '../database/models/commerce.model';
import {BillingSubscription} from '../database/models/billing-subscription.model';
import {BillingPayment} from '../database/models/billing-payment.model';
import {BILLING_MONTHLY_ARS,nextPaidThrough} from './billing-rules';
import {DatabaseService} from '../database/database.service';
import {User} from '../database/models/user.model';
import {safeSubscriptionCheckout,subscriptionEmailMatches} from './checkout-policy';

@Injectable()
export class BillingService {
 constructor(private readonly db:DatabaseService){}
 private token(){const token=process.env.MP_SUBSCRIPTIONS_ACCESS_TOKEN; if(!token) throw new ServiceUnavailableException('Falta configurar Mercado Pago de Diseñolys');return token;}
 private async mp(path:string,options:RequestInit={}):Promise<any> {
  const res=await fetch('https://api.mercadopago.com'+path,{...options,signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+this.token(),Accept:'application/json',...options.headers}});
  const data=await res.json().catch(()=>null);
  if(!res.ok) {
   const error=new ServiceUnavailableException('No se pudo verificar la suscripción con Mercado Pago');
   if([400,401,403,422].includes(res.status)) (error as any).definitiveRejection=true;
   throw error;
  }
  return data;
 }
 async createMerchantSubscription(commerceId:string,payerEmail:string) {
  return this.prepareSubscription(commerceId,payerEmail,false);
 }
 async preparePlanCheckout(commerceId:string|null,userId:string,acceptedMonthly:boolean,amountArs:number) {
  if(!commerceId) throw new BadRequestException('La sesión no tiene un comercio asociado');
  if(process.env.BILLING_ENABLED!=='true') throw new ServiceUnavailableException('El pago del abono no está disponible por el momento');
  if(acceptedMonthly!==true || amountArs!==BILLING_MONTHLY_ARS) throw new BadRequestException('Confirmá el abono mensual de $39.900 antes de continuar');
  const user=await User.findOne({where:{id:userId,commerceId,active:true}});
  if(!user || !['admin','superadmin'].includes(user.role)) throw new BadRequestException('Administrador inválido para esta tienda');
  return this.prepareSubscription(commerceId,user.email,true);
 }
 private validateSubscription(remote:any,row:{commerceId:string;payerEmail:string},collectorId:string) {
  if(!remote?.id || String(remote.collector_id)!==collectorId) throw new ServiceUnavailableException('La suscripción apunta a otra cuenta receptora');
  if(String(remote.external_reference)!==row.commerceId || !subscriptionEmailMatches(remote.payer_email,row.payerEmail) ||
    remote.auto_recurring?.currency_id!=='ARS' || Number(remote.auto_recurring?.transaction_amount)!==BILLING_MONTHLY_ARS ||
    remote.auto_recurring?.frequency!==1 || remote.auto_recurring?.frequency_type!=='months')
    throw new ServiceUnavailableException('La respuesta de Mercado Pago requiere revisión');
 }
 private async prepareSubscription(commerceId:string,payerEmail:string,fromPlan:boolean) {
  const front=(process.env.FRONTEND_URL||'').replace(/\/$/,'');
  const webhook=(process.env.BILLING_WEBHOOK_URL||'').trim();
  if(!/^https:\/\/[^\s]+$/.test(front)) throw new ServiceUnavailableException('FRONTEND_URL debe ser HTTPS');
  if(!/^https:\/\/[^\s/]+\/billing\/webhook$/.test(webhook)) throw new ServiceUnavailableException('BILLING_WEBHOOK_URL inválida o sin configurar');
  const owner=await this.mp('/users/me');
  if(!owner?.id) throw new ServiceUnavailableException('No se pudo verificar la cuenta receptora');
  // Persist intent BEFORE the remote POST. A timeout or a restart must not cause a second subscription.
  const reservation=await this.db.sequelize.transaction(async transaction=>{
   const commerce=await Commerce.findByPk(commerceId,{transaction,lock:transaction.LOCK.UPDATE});
   if(!commerce || (!fromPlan && commerce.active)) throw new BadRequestException('Comercio no elegible para el alta');
   const current=await BillingSubscription.findByPk(commerceId,{transaction,lock:transaction.LOCK.UPDATE});
   if(current?.mpSubscriptionId) return {row:current,create:false};
   if(current?.paidThrough || await BillingPayment.findOne({where:{commerceId},transaction}))
     throw new ConflictException('Esta tienda ya tiene pagos registrados; no se generará otra suscripción');
   if(current) {
    if(current.status==='checkout_failed') { await current.update({status:'creating'},{transaction}); return {row:current,create:true}; }
    return {row:current,create:false};
   }
   const row=await BillingSubscription.create({commerceId,payerEmail,amountArs:BILLING_MONTHLY_ARS,
    status:'creating',mpSubscriptionId:null,checkoutUrl:null,paidThrough:null,startedAt:null},{transaction});
   return {row,create:true};
  });
  const row=reservation.row;
  let remote:any;
  if(row.mpSubscriptionId) {
   remote=await this.mp('/preapproval/'+encodeURIComponent(row.mpSubscriptionId));
   if(String(remote?.id)!==row.mpSubscriptionId) throw new ServiceUnavailableException('La suscripción requiere revisión');
  } else if(reservation.create) {
   try { remote=await this.mp('/preapproval',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    reason:'Diseñolys - Tienda Online',external_reference:commerceId,payer_email:row.payerEmail,
    auto_recurring:{frequency:1,frequency_type:'months',transaction_amount:BILLING_MONTHLY_ARS,currency_id:'ARS'},
    back_url:front+(fromPlan?'/admin/plan?pago=pendiente':'/registro/resultado'),notification_url:webhook,status:'pending',
   })}); } catch(error) {
    // An explicit validation/auth rejection is safe to retry; timeouts and 5xx remain uncertain.
    if((error as any)?.definitiveRejection) await this.db.sequelize.transaction(async transaction=>{
     const fresh=await BillingSubscription.findByPk(commerceId,{transaction,lock:transaction.LOCK.UPDATE});
     if(fresh && !fresh.mpSubscriptionId && fresh.status==='creating') await fresh.update({status:'checkout_failed'},{transaction});
    });
    throw error;
   }
  } else {
   // Recover an uncertain response using the provider's persisted subscription. Never blindly POST again.
   const list=await this.mp('/preapproval/search?'+new URLSearchParams({payer_email:row.payerEmail,limit:'100'}));
   if(!Array.isArray(list.results)||list.paging?.total==null||!Number.isSafeInteger(Number(list.paging.total))||Number(list.paging.total)!==list.results.length)
    throw new ServiceUnavailableException('No pudimos confirmar el intento anterior. Reintentá en unos minutos.');
   const matches=list.results.filter((item:any)=>String(item.external_reference)===commerceId);
   if(matches.length!==1 || !matches[0].id) throw new ServiceUnavailableException('Todavía no pudimos confirmar el intento anterior. No se generó otro cobro. Reintentá en unos minutos.');
   remote=await this.mp('/preapproval/'+encodeURIComponent(String(matches[0].id)));
  }
  this.validateSubscription(remote,row,String(owner.id));
  if(!['pending','authorized','paused','cancelled','canceled'].includes(remote.status)) throw new ServiceUnavailableException('El estado de la suscripción requiere revisión');
  const checkoutUrl=remote.status==='pending'?safeSubscriptionCheckout(remote.init_point,String(remote.id)):null;
  if(remote.status==='pending' && !checkoutUrl) throw new ServiceUnavailableException('Mercado Pago no devolvió un enlace de pago válido');
  await this.db.sequelize.transaction(async transaction=>{
   const fresh=await BillingSubscription.findByPk(commerceId,{transaction,lock:transaction.LOCK.UPDATE});
   if(!fresh || (fresh.mpSubscriptionId && fresh.mpSubscriptionId!==String(remote.id))) throw new ConflictException('El estado del plan cambió. Actualizá la información.');
   // Never overwrite a payment or status that a concurrent webhook has already confirmed.
   await fresh.update({mpSubscriptionId:String(remote.id),checkoutUrl,
    ...(!fresh.paidThrough?{status:remote.status==='authorized'?'authorized':remote.status==='pending'?'pending':'cancelled'}:{})},{transaction});
  });
  if(remote.status==='authorized') return {checkoutUrl:null,status:'authorized',message:'Tu suscripción ya está autorizada. Usá Verificar pago para consultar su acreditación. Si el débito fue rechazado, revisá el medio de pago en Suscripciones de tu cuenta de Mercado Pago.'};
  if(remote.status!=='pending') throw new ConflictException('Esta suscripción está pausada o cancelada. Revisala en tu cuenta de Mercado Pago antes de continuar.');
  // If another browser just paid, do not offer the stale pending checkout again.
  const fresh=await BillingSubscription.findByPk(commerceId);
  if(fresh?.paidThrough || await BillingPayment.findOne({where:{commerceId}})) return {checkoutUrl:null,status:'active',message:'Ya hay un pago acreditado. Actualizá la información de tu plan.'};
  return {checkoutUrl,status:'pending'};
 }
 async refreshPlanPayment(commerceId:string|null) {
  if(!commerceId) throw new BadRequestException('La sesión no tiene un comercio asociado');
  const row=await BillingSubscription.findByPk(commerceId);
  if(!row?.mpSubscriptionId) return {processed:false};
  return this.reconcileSubscription(row.mpSubscriptionId);
 }
 async reconcileSubscription(preapprovalId:string) {
  if(!/^[a-z0-9-]{5,100}$/i.test(preapprovalId)) throw new BadRequestException('Suscripción inválida');
  const row=await BillingSubscription.findOne({where:{mpSubscriptionId:preapprovalId}});
  if(!row) return {processed:false};
  const url='/authorized_payments/search?'+new URLSearchParams({preapproval_id:preapprovalId,limit:'100'}).toString();
  const list=await this.mp(url);
  if(!Array.isArray(list.results)||!Number.isSafeInteger(Number(list.paging?.total))||
     Number(list.paging.total)>list.results.length) throw new ServiceUnavailableException('Resultado incompleto; se requiere reintentar');
  let processed=false;
  for(const invoice of list.results){
    if(invoice.payment?.status==='approved' && invoice.id && (await this.settleAuthorizedPayment(String(invoice.id))).processed) processed=true;
  }
  return {processed};
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
  if(!billing || String(remote.id)!==mpId || String(remote.external_reference)!==billing.commerceId || remote.status!=='authorized' || !subscriptionEmailMatches(remote.payer_email,billing.payerEmail) ||
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
  if(String(subscription.id)!==subId || subscription.status!=='authorized' || String(subscription.external_reference)!==sub.commerceId || !subscriptionEmailMatches(subscription.payer_email,sub.payerEmail) ||
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
    await Commerce.update({active:true,trialConvertedAt:approved},{where:{id:locked.commerceId},transaction});
    return true;
  });
  return {processed:result};
 }
}
