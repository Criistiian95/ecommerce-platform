const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { newTrial, trialExpired, expiredTrialAccess } = require('../dist/billing/trial-policy');
const { AuthService } = require('../dist/auth/auth.service');
const { AuthGuard } = require('../dist/auth/auth.guard');
const { Commerce } = require('../dist/database/models/commerce.model');
const { User } = require('../dist/database/models/user.model');
const { Session } = require('../dist/database/models/session.model');
const { PublicCartService } = require('../dist/catalog/public-cart.service');
const { PublicCheckoutService } = require('../dist/catalog/public-checkout.service');
const { PublicCatalogService } = require('../dist/catalog/public-catalog.service');
afterEach(() => mock.restoreAll());
test('trial lasts exactly 15 days, expires at its boundary and never applies to legacy or converted stores', () => {
  const start = new Date('2026-10-27T12:00:00Z'), t = newTrial(start);
  assert.equal(t.trialEndsAt.toISOString(), '2026-11-11T12:00:00.000Z');
  assert.equal(trialExpired(t, new Date(t.trialEndsAt.getTime()-1)), false);
  assert.equal(trialExpired(t, t.trialEndsAt), true);
  assert.equal(trialExpired({}, t.trialEndsAt), false);
  assert.equal(trialExpired({...t, trialConvertedAt:start}, t.trialEndsAt), false);
});
test('registration grants a server-timed trial atomically without invoking payment provider', async () => {
  const transaction = {}, before = Date.now(); let created;
  mock.method(Commerce, 'findOne', async () => null);
  mock.method(Commerce, 'create', async (data, options) => {assert.equal(options.transaction,transaction);created=data;return {id:'trial-store',...data};});
  mock.method(User, 'create', async (data,options) => {assert.equal(options.transaction,transaction);assert.equal(data.commerceId,'trial-store');assert.equal(data.role,'admin');});
  const service = new AuthService({sequelize:{transaction:async cb=>cb(transaction)}}, {createMerchantSubscription:()=>assert.fail('No payment at signup')});
  const result = await service.registerCommerce({commerceName:'Test',commerceSlug:'trial-shop',adminName:'Owner',email:'a@example.com',password:'long-password',active:false,trialEndsAt:'2099-01-01',role:'superadmin'});
  assert.equal(result.status,'trial'); assert.equal(created.active,true);
  assert.ok(created.trialStartedAt.getTime()>=before);
  assert.equal(created.trialEndsAt-created.trialStartedAt,15*86400000);
  assert.equal(result.checkoutUrl,undefined);
});
test('expired trial restricts customer access and merchant mutations but allows plan activation and data reads', async () => {
  mock.method(Session,'findByPk',async()=>({userId:'owner',expiresAt:new Date(Date.now()+60000)}));
  mock.method(User,'findOne',async()=>({id:'owner'}));
  let commerce={id:'store',trialEndsAt:new Date(0)};
  mock.method(Commerce,'findOne',async()=>commerce);
  const payload={sub:'owner',sid:'session',role:'admin',commerceId:'store'};
  const guard = new AuthGuard({verifyToken:()=>payload});
  const invoke=(method,path)=>guard.canActivate({switchToHttp:()=>({getRequest:()=>({headers:{authorization:'Bearer test'},method,originalUrl:path})})});
  assert.equal(await invoke('GET','/admin/catalog/products'),true);
  assert.equal(await invoke('POST','/admin/plan/checkout'),true);
  assert.equal(await invoke('POST','/admin/plan/sync'),true);
  assert.equal(await invoke('POST','/auth/admin/logout'),true);
  for(const [method,path] of [['POST','/admin/catalog/products'],['PATCH','/admin/commerce/settings'],['POST','/admin/commerce/payments/connect']]) {
    await assert.rejects(invoke(method,path),e=>e.getStatus()===403&&e.getResponse().code==='TRIAL_EXPIRED');
  }
  payload.role='customer';await assert.rejects(invoke('GET','/customer/account/orders'),e=>e.getStatus()===403);
  payload.role='admin';commerce={id:'store',trialEndsAt:new Date(0),trialConvertedAt:new Date()};
  assert.equal(await invoke('POST','/admin/catalog/products'),true);
  commerce=null;await assert.rejects(invoke('GET','/admin/plan'),e=>e.getStatus()===401);
});
test('expired public trial cannot expose catalogue or reserve stock / call Mercado Pago', async () => {
  mock.method(Commerce,'findOne',async()=>({id:'store',trialEndsAt:new Date(0)}));
  const original=Commerce.sequelize; Commerce.sequelize={literal:()=>''};
  try {
    await assert.rejects(new PublicCatalogService().getCatalog('shop'),/Comercio no encontrado/);
    await assert.rejects(new PublicCartService().validateCart('shop',[]),/Comercio no encontrado/);
    await assert.rejects(new PublicCheckoutService({prepareCheckout:()=>assert.fail('No provider call')}).createOrder('shop',{
      checkoutKey:'123456789012345678901',customerName:'Buyer',customerEmail:'b@example.com',customerPhone:'123',deliveryMethod:'pickup',items:[]
    }),/Comercio no encontrado/);
  } finally { Commerce.sequelize=original; }
});
test('access exception only recognizes exact activation endpoints',()=>{
 for(const path of ['/admin/plan/checkout/extra','/admin/plan/sync-evil','/admin/catalog/products']) assert.equal(expiredTrialAccess('admin','POST',path),false);
 assert.equal(expiredTrialAccess('customer','GET','/admin/plan'),false);
 assert.equal(expiredTrialAccess('operator','POST','/admin/plan/checkout'),false);
});
