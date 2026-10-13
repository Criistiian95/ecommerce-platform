const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { OrderEmailService } = require('../dist/catalog/order-email.service');
afterEach(() => mock.restoreAll());
test('email transport requires a provider id before marking sent and uses a stable idempotency header', async () => {
  let request;
  mock.method(global, 'fetch', async (url, options) => { request = options; return { ok: true, json: async () => ({ id: 'accepted' }) }; });
  const result = await new OrderEmailService().sendMessage('{"subject":"Test"}', 'order-confirmation/example');
  assert.equal(request.body, '{"subject":"Test"}'); assert.equal(result.id, 'accepted'); assert.equal(request.headers['Idempotency-Key'], 'order-confirmation/example');
});
for (const [status, name, retryable] of [[429, null, true], [503, null, true], [422, null, false], [409, 'invalid_idempotent_request', false], [409, 'concurrent_idempotent_requests', true]]) {
  test(`email transport classifies ${status}/${name}`, async () => {
    mock.method(global, 'fetch', async () => ({ ok: false, status, json: async () => ({ name }) }));
    const result = await new OrderEmailService().sendMessage('{}', 'key'); assert.equal(result.retryable, retryable); assert.equal(result.id, undefined);
  });
}
test('network timeout and malformed successful responses retry without claiming sent', async () => {
  mock.method(global, 'fetch', async () => { throw new Error('timeout'); });
  assert.deepEqual(await new OrderEmailService().sendMessage('{}', 'key'), { retryable: true, error: 'provider_network_error' });
  mock.method(global, 'fetch', async () => ({ ok: true, status: 200, json: async () => ({}) }));
  const result = await new OrderEmailService().sendMessage('{}', 'key'); assert.equal(result.id, undefined); assert.equal(result.retryable, true);
});

test('merchant message contains the sale snapshot, escapes HTML and only targets the merchant', () => {
  const input = {commerceName:'Shop', orderNumber:'123', customerName:'<script>name</script>', customerEmail:'buyer@example.com', customerPhone:'1234', merchantEmail:'seller@example.com', deliveryMethod:'shipping', address:'Street 123', notes:'<img src=x>', total:200, items:[{name:'Product',quantity:2,unitPrice:100,lineTotal:200}]};
  const service = new OrderEmailService();
  const message = service.buildMerchantMessage(input, 'shop@example.com');
  assert.deepEqual(message.to, ['seller@example.com']);
  for (const value of ['1234','buyer@example.com','Street 123','2 x Product','Total:']) assert.ok(message.text.includes(value));
  assert.ok(!message.html.includes('<script>')); assert.ok(!message.html.includes('<img'));
  assert.ok(message.html.includes('&lt;img'));
  assert.deepEqual(service.buildMessage(input,'shop@example.com').to, ['buyer@example.com']);
});
