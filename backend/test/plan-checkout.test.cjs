const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { BillingService } = require('../dist/billing/billing.service');
const { Commerce } = require('../dist/database/models/commerce.model');
const { User } = require('../dist/database/models/user.model');
const { BillingSubscription } = require('../dist/database/models/billing-subscription.model');
const { BillingPayment } = require('../dist/database/models/billing-payment.model');
const { AdminPlanController } = require('../dist/catalog/admin-plan.controller');
const envKeys = ['BILLING_ENABLED','MP_SUBSCRIPTIONS_ACCESS_TOKEN','FRONTEND_URL','BILLING_WEBHOOK_URL'];
const initial = Object.fromEntries(envKeys.map(key => [key,process.env[key]]));
afterEach(() => { mock.restoreAll(); for(const key of envKeys) initial[key]===undefined ? delete process.env[key] : process.env[key]=initial[key]; });
function fixture(options={}) {
  process.env.BILLING_ENABLED='true'; process.env.MP_SUBSCRIPTIONS_ACCESS_TOKEN='TEST-fake-token';
  process.env.FRONTEND_URL='https://disenolys.store'; process.env.BILLING_WEBHOOK_URL='https://api.example.com/billing/webhook';
  const state={row:options.row||null,posts:0,remote:null};
  const remote={id:'subscription-one',status:'pending',collector_id:123,external_reference:'store-a',payer_email:'owner@example.com',
    init_point:'https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=subscription-one',
    auto_recurring:{frequency:1,frequency_type:'months',transaction_amount:39900,currency_id:'ARS'},...options.remote};
  const update = async function(values) { Object.assign(this,values); return this; };
  if(state.row) state.row.update=update;
  const db={sequelize:{transaction:async fn=>fn({LOCK:{UPDATE:'UPDATE'}})}};
  mock.method(User,'findOne',async ({where})=>where.id==='owner-a'&&where.commerceId==='store-a'?{email:'owner@example.com',role:'admin'}:null);
  mock.method(Commerce,'findByPk',async id=>{ assert.equal(id,'store-a'); return {id,active:true}; });
  mock.method(Commerce,'update',()=>assert.fail('Preparing checkout cannot change access'));
  mock.method(BillingSubscription,'findByPk',async id=>{assert.equal(id,'store-a');return state.row;});
  mock.method(BillingSubscription,'create',async values=>{assert.equal(state.row,null);state.row={...values,update};return state.row;});
  mock.method(BillingPayment,'findOne',async()=>options.paid?{id:'paid'}:null);
  mock.method(global,'fetch',async (url,request)=>{
    const path=String(url), response=data=>({ok:true,json:async()=>data});
    if(path.endsWith('/users/me')) return response({id:123});
    if(request.method==='POST') {
      state.posts++; assert.equal(state.row.status,'creating');
      const body=JSON.parse(request.body);
      assert.equal(body.status,'pending'); assert.equal(body.external_reference,'store-a');
      assert.equal(body.payer_email,'owner@example.com'); assert.equal(body.auto_recurring.transaction_amount,39900);
      state.remote=remote;
      if(options.timeout) throw new Error('network response lost');
      return response(remote);
    }
    if(path.includes('/preapproval/search?')) return response({paging:{total:state.remote?1:0},results:state.remote?[state.remote]:[]});
    if(path.endsWith('/preapproval/subscription-one')) return response(remote);
    throw Error('Unexpected provider request');
  });
  return {service:new BillingService(db),state,remote};
}
test('self-service requires consent, fixed price, tenant owner and enabled billing',async()=>{
  const {service,state}=fixture();
  for(const args of [[null,'owner-a',true,39900],['store-a','owner-a',false,39900],['store-a','owner-a',true,1],['store-a','other-owner',true,39900]]) await assert.rejects(service.preparePlanCheckout(...args));
  process.env.BILLING_ENABLED='false'; await assert.rejects(service.preparePlanCheckout('store-a','owner-a',true,39900));
  assert.equal(state.posts,0); assert.equal(state.row,null);
});
test('legacy merchant starts one pending subscription and repeat requests reuse it',async()=>{
  const {service,state,remote}=fixture();
  const first=await service.preparePlanCheckout('store-a','owner-a',true,39900);
  assert.equal(first.checkoutUrl,remote.init_point); assert.equal(state.row.paidThrough,null);
  assert.equal(state.row.status,'pending'); assert.equal(state.row.mpSubscriptionId,remote.id);
  assert.deepEqual(await service.preparePlanCheckout('store-a','owner-a',true,39900),first);
  assert.equal(state.posts,1);
});
test('a lost POST response is recovered without a second subscription',async()=>{
  const {service,state}=fixture({timeout:true});
  await assert.rejects(service.preparePlanCheckout('store-a','owner-a',true,39900),/response lost/);
  assert.equal(state.row.status,'creating');
  assert.equal((await service.preparePlanCheckout('store-a','owner-a',true,39900)).status,'pending');
  assert.equal(state.posts,1);
});
test('uncertain creation with no remote match never retries POST blindly',async()=>{
  const {service,state}=fixture({row:{commerceId:'store-a',payerEmail:'owner@example.com',status:'creating',mpSubscriptionId:null}});
  await assert.rejects(service.preparePlanCheckout('store-a','owner-a',true,39900),/intento anterior/);
  assert.equal(state.posts,0);
});
for(const [label,remote] of Object.entries({collector:{collector_id:999},tenant:{external_reference:'store-b'},payer:{payer_email:'other@example.com'},amount:{auto_recurring:{frequency:1,frequency_type:'months',transaction_amount:1,currency_id:'ARS'}},otherSubscription:{init_point:'https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=another-store'},url:{init_point:'https://mercadopago.com.ar.evil.example/subscriptions/checkout'}})) {
  test('checkout rejects wrong '+label,async()=>{
    const {service,state}=fixture({remote});
    await assert.rejects(service.preparePlanCheckout('store-a','owner-a',true,39900));
    assert.equal(state.row.paidThrough,null); assert.equal(state.row.mpSubscriptionId,null);
  });
}
test('an authorized subscription never exposes a second payment checkout or marks itself paid',async()=>{
  const {service,state}=fixture({row:{commerceId:'store-a',payerEmail:'owner@example.com',mpSubscriptionId:'subscription-one',status:'pending',paidThrough:null},remote:{status:'authorized'}});
  const result=await service.preparePlanCheckout('store-a','owner-a',true,39900);
  assert.equal(result.checkoutUrl,null); assert.equal(result.status,'authorized');
  assert.equal(state.row.paidThrough,null); assert.equal(state.posts,0);
});
test('payment records without a subscription block a second billing enrollment',async()=>{
  const {service,state}=fixture({paid:true});
  await assert.rejects(service.preparePlanCheckout('store-a','owner-a',true,39900),/pagos registrados/);
  assert.equal(state.posts,0);
});
test('checkout and sync controllers use only the authenticated merchant',async()=>{
  const calls=[];
  const controller=new AdminPlanController({}, {preparePlanCheckout:async(...args)=>calls.push(args),refreshPlanPayment:async id=>calls.push(id)});
  const req={auth:{commerceId:'store-a',userId:'owner-a'}};
  await controller.checkout(req,{commerceId:'store-b',userId:'attacker',acceptedMonthly:true,amountArs:39900});
  await controller.sync(req);
  assert.deepEqual(calls,[['store-a','owner-a',true,39900],'store-a']);
});

test('a definitive provider rejection can retry, while preserving a single checkout intent',async()=>{
 const {service,state,remote}=fixture();
 let posts=0;
 mock.method(global,'fetch',async(url,request)=>{
  if(String(url).endsWith('/users/me')) return {ok:true,json:async()=>({id:123})};
  if(request.method==='POST') { posts++; return posts===1?{ok:false,status:400,json:async()=>({})}:{ok:true,json:async()=>remote}; }
  throw Error('Unexpected request');
 });
 await assert.rejects(service.preparePlanCheckout('store-a','owner-a',true,39900));
 assert.equal(state.row.status,'checkout_failed');
 assert.equal((await service.preparePlanCheckout('store-a','owner-a',true,39900)).checkoutUrl,remote.init_point);
 assert.equal(posts,2); assert.equal(state.row.status,'pending');
});

for (const payer_email of [undefined, null, '']) {
 test('provider preapproval can omit payer email without blocking its verified checkout: '+String(payer_email), async()=>{
  const {service,state}=fixture({remote:{payer_email}});
  assert.equal((await service.preparePlanCheckout('store-a','owner-a',true,39900)).status,'pending');
  assert.equal(state.posts,1); assert.equal(state.row.paidThrough,null);
 });
}
test('recover a persisted intent when Mercado Pago omits payer email',async()=>{
 const {service,state}=fixture({timeout:true,remote:{payer_email:undefined}});
 await assert.rejects(service.preparePlanCheckout('store-a','owner-a',true,39900));
 assert.equal((await service.preparePlanCheckout('store-a','owner-a',true,39900)).status,'pending');
 assert.equal(state.posts,1);
});
