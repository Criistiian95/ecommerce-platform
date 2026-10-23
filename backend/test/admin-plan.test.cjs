const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { AdminPlanService } = require('../dist/catalog/admin-plan.service');
const { AdminPlanController } = require('../dist/catalog/admin-plan.controller');
const { AuthGuard } = require('../dist/auth/auth.guard');
const { RolesGuard } = require('../dist/auth/roles.guard');
const { ROLES_KEY } = require('../dist/auth/roles.decorator');
const { Commerce } = require('../dist/database/models/commerce.model');
const { BillingSubscription } = require('../dist/database/models/billing-subscription.model');
const { BillingPayment } = require('../dist/database/models/billing-payment.model');
const oldFlag = process.env.BILLING_ENABLED;
afterEach(() => { mock.restoreAll(); if (oldFlag === undefined) delete process.env.BILLING_ENABLED; else process.env.BILLING_ENABLED = oldFlag; });
function fixture(subscription = null, payments = []) {
  mock.method(Commerce, 'findByPk', async id => { assert.equal(id, 'store-a'); return { id, name: 'A', slug: 'store-a', active: true }; });
  mock.method(BillingSubscription, 'findByPk', async id => { assert.equal(id, 'store-a'); return subscription; });
  mock.method(BillingPayment, 'findAndCountAll', async options => {
    assert.deepEqual(options.where, { commerceId: 'store-a' });
    assert.equal(options.limit, 10); assert.ok(options.attributes.includes('approvedAt'));
    return { rows: payments.slice(options.offset, options.offset + options.limit), count: payments.length };
  });
  mock.method(BillingPayment, 'findOne', async options => { assert.deepEqual(options.where, { commerceId: 'store-a' }); return payments[0] || null; });
  mock.method(BillingSubscription, 'create', () => assert.fail('A plan read must not create a subscription'));
  mock.method(global, 'fetch', () => assert.fail('A plan read must not call a payment provider'));
}
test('existing stores with no subscription retain their status and get no checkout or invented due date', async () => {
  fixture(); process.env.BILLING_ENABLED = 'true';
  const p = await new AdminPlanService().getPlan('store-a');
  assert.equal(p.commerce.active, true); assert.equal(p.subscription, null); assert.equal(p.lastPayment, null);
  assert.equal(p.paymentAction.kind, 'start'); assert.equal(p.paymentAction.amountArs, 39900);
  assert.equal(p.currentOffer.amountArs, 39900); assert.equal(p.payments.length, 0);
});
test('history is tenant-scoped, paginated, and the last payment is independent of the history page', async () => {
  const payments = Array.from({ length: 12 }, (_, i) => ({ id: 'p'+i, mpPaymentId: String(9000+i), approvedAt: new Date(2026, 9, 23-i) }));
  fixture({ status: 'active', amountArs: 39900, paidThrough: new Date('2026-11-23T12:00:00Z'), startedAt: payments[0].approvedAt, payerEmail: 'private@example.com', mpSubscriptionId: 'private-id', checkoutUrl: 'https://www.mercadopago.com.ar/subscriptions/checkout' }, payments);
  process.env.BILLING_ENABLED = 'true';
  const p = await new AdminPlanService().getPlan('store-a', 2);
  assert.equal(p.payments.length, 2); assert.equal(p.lastPayment.id, 'p0'); assert.equal(p.pagination.total, 12);
  assert.equal(p.subscription.paidThrough, '2026-11-23T12:00:00.000Z'); assert.equal(p.subscription.checkoutUrl, null); assert.equal(p.paymentAction.kind, 'none');
  assert.ok(!JSON.stringify(p).includes('private@example.com')); assert.ok(!JSON.stringify(p).includes('private-id'));
});
test('only pending unpaid subscriptions with billing enabled expose a genuine Mercado Pago checkout', async () => {
  const subscription = { status: 'pending', amountArs: 39900, paidThrough: null, startedAt: null, checkoutUrl: 'https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=one' };
  fixture(subscription);
  process.env.BILLING_ENABLED = 'false';
  assert.equal((await new AdminPlanService().getPlan('store-a')).subscription.checkoutUrl, null);
  process.env.BILLING_ENABLED = 'true';
  assert.match((await new AdminPlanService().getPlan('store-a')).subscription.checkoutUrl, /mercadopago/);
  for (const url of ['javascript:alert(1)', 'https://mercadopago.com.ar.evil.example/pay', 'https://user:secret@mercadopago.com.ar/pay', 'http://mercadopago.com.ar/pay']) {
    subscription.checkoutUrl = url;
    assert.equal((await new AdminPlanService().getPlan('store-a')).subscription.checkoutUrl, null);
  }
});
test('unscoped sessions and invalid pages never reach the database', async () => {
  mock.method(Commerce, 'findByPk', () => assert.fail('Invalid scope must not query a store'));
  await assert.rejects(new AdminPlanService().getPlan(null), /comercio asociado/);
  for (const page of [0, -1, 1.2, NaN, Infinity, 10001]) await assert.rejects(new AdminPlanService().getPlan('store-a', page), /Página inválida/);
});
test('controller takes tenant only from authenticated session and requires admin guards', async () => {
  const controller = new AdminPlanController({ getPlan: async (id, page) => ({ id, page }) });
  assert.deepEqual(await controller.getPlan({ auth: { commerceId: 'store-a' }, query: { commerceId: 'store-b' } }, '2'), { id: 'store-a', page: 2 });
  assert.deepEqual(Reflect.getMetadata('__guards__', AdminPlanController), [AuthGuard, RolesGuard]);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, AdminPlanController), ['admin', 'superadmin']);
});
