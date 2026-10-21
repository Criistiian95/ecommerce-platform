'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkBillingTestEnvironment } = require('../scripts/check-billing-test-env.cjs');

const env = {
  BILLING_TEST_ENVIRONMENT: 'isolated', BILLING_ENABLED: 'false',
  BILLING_RECONCILIATION_ENABLED: 'false', BOOTSTRAP_DEMO: 'false',
  DATABASE_URL: 'mysql://test:test@localhost:3308/disenolys_billing_test',
  FRONTEND_URL: 'https://billing-test-web.example.org',
  BILLING_WEBHOOK_URL: 'https://billing-test-api.example.org/billing/webhook',
  BILLING_TEST_SELLER_ID: '123', BILLING_TEST_BUYER_ID: '456',
  BILLING_TEST_BUYER_EMAIL: 'buyer@testuser.com',
  MP_SUBSCRIPTIONS_ACCESS_TOKEN: 'APP_USR-fixture-only-not-a-real-token',
  MP_SUBSCRIPTIONS_WEBHOOK_SECRET: 'fixture-only-not-a-real-secret',
};
const account = { id: 123, site_id: 'MLA', tags: ['test_user'], email: 'seller@testuser.com' };
const reply = value => ({ ok: true, status: 200, json: async () => value });

test('preflight checks test seller with one read-only request and does not imply E2E success', async () => {
  const calls = [];
  const result = await checkBillingTestEnvironment(env, async (url, options) => {
    calls.push({ url, options }); return reply(account);
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.mercadopago.com/users/me');
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${env.MP_SUBSCRIPTIONS_ACCESS_TOKEN}`);
  assert.equal(calls[0].options.body, undefined);
  assert.deepEqual(result, { configChecked: true, sellerTestAccountVerified: true, endToEndVerified: false });
});

test('unsafe configuration fails before sending credentials to Mercado Pago', async () => {
  const cases = [
    { BILLING_TEST_ENVIRONMENT: undefined },
    { BILLING_RECONCILIATION_ENABLED: 'true' },
    { BOOTSTRAP_DEMO: 'true' },
    { DATABASE_URL: 'mysql://secret:password@prod.example.org/ecommerce' },
    { DATABASE_URL: 'malformed-secret' },
    { FRONTEND_URL: 'https://ecommerce-platform-web.onrender.com' },
    { FRONTEND_URL: 'https://disenolys.store' },
    { FRONTEND_URL: 'https://demo-2.disenolys.store.' },
    { FRONTEND_URL: 'http://test.example.org' },
    { FRONTEND_URL: 'https://test.example.org/registro' },
    { FRONTEND_URL: 'https://secret:password@test.example.org' },
    { BILLING_WEBHOOK_URL: 'https://ecommerce-platform-api-2kh1.onrender.com/billing/webhook' },
    { BILLING_WEBHOOK_URL: 'https://test.example.org/billing/webhook?token=secret' },
    { BILLING_WEBHOOK_URL: 'https://test.example.org/wrong-path' },
    { BILLING_TEST_BUYER_ID: '123' },
    { BILLING_TEST_BUYER_EMAIL: 'real@example.org' },
    { MP_SUBSCRIPTIONS_ACCESS_TOKEN: '' },
    { MP_SUBSCRIPTIONS_WEBHOOK_SECRET: '' },
  ];
  for (const patch of cases) {
    let called = false;
    await assert.rejects(checkBillingTestEnvironment({ ...env, ...patch }, async () => {
      called = true; return reply(account);
    }));
    assert.equal(called, false, Object.keys(patch)[0]);
  }
});

test('wrong collector, real account, wrong country or missing account cannot pass', async () => {
  for (const value of [
    { ...account, id: 999 }, { ...account, tags: ['normal'] },
    { ...account, tags: undefined }, { ...account, site_id: 'MLB' },
    { ...account, email: env.BILLING_TEST_BUYER_EMAIL }, null,
  ]) {
    await assert.rejects(checkBillingTestEnvironment(env, async () => reply(value)));
  }
});

test('provider failures do not expose tokens or response bodies', async () => {
  const secret = env.MP_SUBSCRIPTIONS_ACCESS_TOKEN;
  for (const fetchImpl of [
    async () => { throw new Error(secret); },
    async () => ({ ok: false, status: 401, json: async () => ({ message: secret }) }),
    async () => ({ ok: true, status: 200, json: async () => { throw new Error(secret); } }),
  ]) {
    await assert.rejects(checkBillingTestEnvironment(env, fetchImpl), error => {
      assert.equal(error.message.includes(secret), false);
      return true;
    });
  }
});
