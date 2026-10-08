const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { MpConnectionService } = require('../dist/catalog/mp-connection.service');
const { MercadoPagoService } = require('../dist/catalog/mercado-pago.service');
const { Commerce } = require('../dist/database/models/commerce.model');
const { Order } = require('../dist/database/models/order.model');
const { MpConnection } = require('../dist/database/models/mp-connection.model');
afterEach(() => mock.restoreAll());
process.env.MP_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
test('credentials are encrypted, authenticated and bound to their commerce', () => {
  const service = new MpConnectionService();
  const value = service.encrypt('secret-access-token', 'commerce-a');
  assert.ok(!value.includes('secret-access-token'));
  assert.equal(service.decrypt(value, 'commerce-a'), 'secret-access-token');
  assert.throws(() => service.decrypt(value, 'commerce-b'));
  const tampered = Buffer.from(value, 'base64'); tampered[30] ^= 1;
  assert.throws(() => service.decrypt(tampered.toString('base64'), 'commerce-a'));
});
test('new checkout never uses platform token as fallback', async () => {
  const service = new MercadoPagoService({}, { credentials: async () => { throw new Error('not connected'); } });
  const fetch = mock.method(global, 'fetch', async () => { throw new Error('must not call payment provider'); });
  await assert.rejects(service.prepareCheckout('a'), /not connected/);
  await assert.rejects(service.createCheckout({ commerceId: 'a' }, []), /connected seller/);
  assert.equal(fetch.mock.callCount(), 0);
});
test('checkout uses the order seller token, with no platform commission', async () => {
  process.env.FRONTEND_URL = 'https://shop.example';
  mock.method(Commerce, 'findByPk', async id => { assert.equal(id, 'a'); return { slug: 'comercio-a' }; });
  const service = new MercadoPagoService({}, { credentials: async id => { assert.equal(id, 'a'); return { token: 'seller-a', collectorId: '123' }; } });
  const fetch = mock.method(global, 'fetch', async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer seller-a');
    const body = JSON.parse(options.body);
    for (const outcome of ['success', 'failure', 'pending']) assert.equal(body.back_urls[outcome], `https://shop.example/tienda/comercio-a/pago/resultado?result=${outcome}&order=order-a`); assert.equal(body.external_reference, 'order-a'); assert.equal(body.marketplace_fee, undefined);
    return { ok: true, json: async () => ({ id: 'pref', init_point: 'https://mp.example' }) };
  });
  await service.createCheckout({ id: 'order-a', commerceId: 'a', mpCollectorId: '123', update: async () => {} }, [{ title: 'Item', quantity: 1, unitPrice: 10 }]);
  assert.equal(fetch.mock.callCount(), 1);
});
test('wrong collector or external reference cannot confirm an order', async () => {
  const order = { id: 'order-a', commerceId: 'a', mpCollectorId: '123', total: '100' };
  const service = new MercadoPagoService({}, { credentials: async () => ({ token: 'seller-a', collectorId: '123' }) });
  const confirm = mock.method(service, 'confirmPaidOrder', async () => {});
  const fetch = mock.method(service, 'fetchPayment', async () => ({ id: 1, collector_id: 456, external_reference: 'order-a', status: 'approved', currency_id: 'ARS', transaction_amount: 100 }));
  await assert.rejects(service.processPaymentNotification('1', order), /collector mismatch/);
  fetch.mock.mockImplementation(async () => ({ id: 1, collector_id: 123, external_reference: 'order-b' }));
  await assert.rejects(service.processPaymentNotification('1', order), /order mismatch/);
  assert.equal(confirm.mock.callCount(), 0);
});
test('webhook cannot route a seller payment into another commerce', async () => {
  const service = new MercadoPagoService({}, { credentials: async () => ({ token: 'seller-a', collectorId: '123' }) });
  mock.method(MpConnection, 'findOne', async () => ({ commerceId: 'a' }));
  mock.method(service, 'fetchPayment', async () => ({ collector_id: 123, external_reference: 'order-b' }));
  mock.method(Order, 'findByPk', async () => ({ commerceId: 'b', mpCollectorId: '123' }));
  await assert.rejects(service.processPaymentNotification('1', undefined, '123'), /commerce mismatch/);
});
test('valid seller payment confirms only after amount validation', async () => {
  const order = { id: 'order-a', commerceId: 'a', mpCollectorId: '123', total: '100' };
  const service = new MercadoPagoService({}, { credentials: async () => ({ token: 'seller-a', collectorId: '123' }) });
  mock.method(Order, 'findByPk', async () => order);
  const fetch = mock.method(service, 'fetchPayment', async () => ({ collector_id: 123, external_reference: 'order-a', status: 'approved', currency_id: 'ARS', transaction_amount: 99 }));
  const confirm = mock.method(service, 'confirmPaidOrder', async () => {});
  await service.processPaymentNotification('1', order); assert.equal(confirm.mock.callCount(), 0);
  fetch.mock.mockImplementation(async () => ({ collector_id: 123, external_reference: 'order-a', status: 'approved', currency_id: 'ARS', transaction_amount: 100 }));
  await service.processPaymentNotification('1', order); assert.equal(confirm.mock.callCount(), 1);
});
