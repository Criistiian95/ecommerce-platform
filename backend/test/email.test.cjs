const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { OrderEmailService } = require('../dist/catalog/order-email.service');
afterEach(() => mock.restoreAll());
test('email transport requires a provider id before marking sent and uses a stable idempotency header', async () => {
  let request;
  mock.method(global, 'fetch', async (url, options) => { request = options; return { ok: true, json: async () => ({ id: 'accepted' }) }; });
  const result = await new OrderEmailService().sendMessage({ subject: 'Test' }, 'order-confirmation/example');
  assert.equal(result.id, 'accepted'); assert.equal(request.headers['Idempotency-Key'], 'order-confirmation/example');
});
for (const [status, name, retryable] of [[429, null, true], [503, null, true], [422, null, false], [409, 'invalid_idempotent_request', false], [409, 'concurrent_idempotent_requests', true]]) {
  test(`email transport classifies ${status}/${name}`, async () => {
    mock.method(global, 'fetch', async () => ({ ok: false, status, json: async () => ({ name }) }));
    const result = await new OrderEmailService().sendMessage({}, 'key'); assert.equal(result.retryable, retryable); assert.equal(result.id, undefined);
  });
}
test('network timeout and malformed successful responses retry without claiming sent', async () => {
  mock.method(global, 'fetch', async () => { throw new Error('timeout'); });
  assert.deepEqual(await new OrderEmailService().sendMessage({}, 'key'), { retryable: true, error: 'provider_network_error' });
  mock.method(global, 'fetch', async () => ({ ok: true, status: 200, json: async () => ({}) }));
  const result = await new OrderEmailService().sendMessage({}, 'key'); assert.equal(result.id, undefined); assert.equal(result.retryable, true);
});
