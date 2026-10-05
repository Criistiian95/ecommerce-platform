const { test, before, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const target = new URL(process.env.TEST_DATABASE_URL || 'mysql://localhost/missing');
if (!['localhost', '127.0.0.1'].includes(target.hostname) || !target.pathname.startsWith('/ecommerce_test_')) {
  throw new Error('Use an isolated local database named ecommerce_test_* via TEST_DATABASE_URL');
}
process.env.DATABASE_URL = target.toString();
process.env.DB_SYNC = 'true';
process.env.BOOTSTRAP_DEMO = 'false';
const { DatabaseService } = require('../dist/database/database.service');
const { PublicCheckoutService } = require('../dist/catalog/public-checkout.service');
const { CatalogService } = require('../dist/catalog/catalog.service');
const { MercadoPagoService } = require('../dist/catalog/mercado-pago.service');
const { Commerce } = require('../dist/database/models/commerce.model');
const { Product } = require('../dist/database/models/product.model');
const { Order } = require('../dist/database/models/order.model');
const { OrderItem } = require('../dist/database/models/order-item.model');
const { StockMovement } = require('../dist/database/models/stock-movement.model');
const { User } = require('../dist/database/models/user.model');
const db = new DatabaseService();
const { runMigrations } = require('../dist/database/migrations/runner');
before(async () => { await runMigrations(db.sequelize); await db.onModuleInit(); });
afterEach(() => mock.restoreAll());
after(async () => { await db.onModuleDestroy(); });
async function fixture(stock = 10) {
  const commerce = await Commerce.create({ name: 'Test', slug: randomUUID(), active: true });
  const user = await User.create({ commerceId: commerce.id, email: `${randomUUID()}@example.com`, name: 'Test', passwordHash: 'unused-test-only', role: 'admin' });
  const product = await Product.create({ commerceId: commerce.id, sku: 'SKU', name: 'Test', price: 100, currentStock: stock });
  let preferences = 0;
  const checkout = new PublicCheckoutService({ async createCheckout(order) {
    preferences++;
    await order.update({ mpOrderId: randomUUID(), mpCheckoutUrl: 'https://example.com/test-checkout' });
    return { checkoutUrl: order.mpCheckoutUrl };
  } });
  const request = { checkoutKey: randomUUID(), customerName: 'Test', customerEmail: 'test@example.com', customerPhone: '123', deliveryMethod: 'pickup', items: [{ productId: product.id, quantity: 2 }] };
  return { commerce, user, product, checkout, request, preferences: () => preferences };
}
test('MySQL: versioned legacy upgrade is repeatable and startup is read-only', async () => {
  for (const column of ['checkout_key', 'checkout_hash', 'reservation_expires_at', 'reservation_checked_at', 'payment_review_required']) {
    await db.sequelize.query(`ALTER TABLE orders DROP COLUMN ${column}`);
  }
  await db.sequelize.query("DELETE FROM schema_migrations WHERE version = '002_legacy_checkout'");
  await assert.rejects(db.onModuleInit(), /migrations pending/);
  await Promise.all([runMigrations(db.sequelize), runMigrations(db.sequelize)]);
  const original = db.sequelize.query.bind(db.sequelize);
  const statements = [];
  mock.method(db.sequelize, 'query', (...args) => { statements.push(args[0]); return original(...args); });
  await db.onModuleInit();
  assert.equal(statements.some(sql => /ALTER|CREATE|DROP/i.test(sql)), false);
  const [versions] = await original('SELECT version FROM schema_migrations');
  assert.equal(versions.length, 3);
  const [indexes] = await db.sequelize.query("SHOW INDEX FROM orders WHERE Column_name = 'checkout_key'");
  assert.ok(indexes.some(index => index.Non_unique === 0));
});
test('MySQL: concurrent duplicate checkouts reserve once', async () => {
  const f = await fixture();
  const results = await Promise.allSettled([f.checkout.createOrder(f.commerce.slug, f.request), f.checkout.createOrder(f.commerce.slug, f.request)]);
  assert.ok(results.some(result => result.status === 'fulfilled'));
  for (const result of results) if (result.status === 'rejected') assert.equal(result.reason.getStatus(), 409);
  assert.equal(await Order.count({ where: { commerceId: f.commerce.id } }), 1);
  assert.equal((await f.product.reload()).currentStock, 8);
  assert.equal(f.preferences(), 1);
  const replay = await f.checkout.createOrder(f.commerce.slug, f.request);
  assert.ok(replay.payment.checkoutUrl);
});
test('MySQL: aggregated duplicate lines and simultaneous adjustment preserve stock', async () => {
  const f = await fixture(); f.request.items.push({ productId: f.product.id, quantity: 3 });
  const [result] = await Promise.all([
    f.checkout.createOrder(f.commerce.slug, f.request),
    new CatalogService().adjustStock(f.commerce.id, f.user.id, f.product.id, { quantityChange: 4 }),
  ]);
  assert.equal((await f.product.reload()).currentStock, 9);
  const lines = await OrderItem.findAll({ where: { orderId: result.order.id } });
  assert.equal(lines.length, 1); assert.equal(lines[0].quantity, 5);
  assert.equal(await StockMovement.count({ where: { productId: f.product.id } }), 2);
});
test('MySQL: overselling rollback leaves no order or stock movement', async () => {
  const f = await fixture(3); f.request.items.push({ productId: f.product.id, quantity: 2 });
  await assert.rejects(f.checkout.createOrder(f.commerce.slug, f.request), /disponibilidad/);
  assert.equal((await f.product.reload()).currentStock, 3);
  assert.equal(await Order.count({ where: { commerceId: f.commerce.id } }), 0);
  assert.equal(await StockMovement.count({ where: { productId: f.product.id } }), 0);
});
test('MySQL: concurrent releases return stock once', async () => {
  const f = await fixture(); const result = await f.checkout.createOrder(f.commerce.slug, f.request);
  const first = await Order.findByPk(result.order.id); const second = await Order.findByPk(result.order.id);
  const payments = new MercadoPagoService({});
  await Promise.all([payments.releaseReservation(first, 'cancelled'), payments.releaseReservation(second, 'cancelled')]);
  assert.equal((await f.product.reload()).currentStock, 10);
  assert.equal(await StockMovement.count({ where: { productId: f.product.id, type: 'release' } }), 1);
});

const { OrderEmailDelivery } = require('../dist/database/models/order-email-delivery.model');
const { OrderEmailService } = require('../dist/catalog/order-email.service');
const { OrderEmailWorker } = require('../dist/catalog/order-email-worker.service');
async function paidFixture() {
  const f = await fixture(); const result = await f.checkout.createOrder(f.commerce.slug, f.request);
  const order = await Order.findByPk(result.order.id);
  const email = new OrderEmailService(); const mp = new MercadoPagoService(email);
  await mp.confirmPaidOrder(order);
  return { ...f, order, email, mp, delivery: await OrderEmailDelivery.findOne({ where: { orderId: order.id } }) };
}
function configured() { process.env.RESEND_API_KEY = 'unit-test-only'; process.env.ORDER_EMAIL_FROM = 'Demo <test@example.com>'; }
test('MySQL: payment and email scheduling are atomic, duplicate notifications schedule once', async () => {
  const f = await paidFixture();
  await f.mp.confirmPaidOrder(await Order.findByPk(f.order.id));
  assert.equal(await OrderEmailDelivery.count({ where: { orderId: f.order.id } }), 1);
  assert.equal(f.delivery.status, 'pending');
  assert.equal((await f.order.reload()).paymentStatus, 'paid');
  const broken = await fixture(); const result = await broken.checkout.createOrder(broken.commerce.slug, broken.request);
  const order = await Order.findByPk(result.order.id);
  await assert.rejects(new MercadoPagoService({ enqueue: async () => { throw new Error('outbox unavailable'); } }).confirmPaidOrder(order), /outbox unavailable/);
  assert.equal((await order.reload()).paymentStatus, 'pending');
  assert.equal(await StockMovement.count({ where: { productId: broken.product.id, type: 'sale' } }), 0);
});
test('MySQL: two email workers claim one message; retry keeps the exact body and key', async () => {
  // Isolate due messages created by earlier tests without deleting their records.
  await OrderEmailDelivery.update({ nextAttemptAt: new Date(Date.now() + 86400000) }, { where: { status: 'pending' } });
  const f = await paidFixture(); configured();
  const bodies = []; const keys = [];
  mock.method(f.email, 'sendMessage', async (body, key) => { bodies.push(body); keys.push(key); return { retryable: true, error: 'temporary' }; });
  await Promise.all([new OrderEmailWorker(f.email).run(), new OrderEmailWorker(f.email).run()]);
  assert.equal(bodies.length, 1);
  await f.delivery.reload(); assert.equal(f.delivery.status, 'pending'); assert.equal(f.delivery.attempts, 1);
  await f.delivery.update({ nextAttemptAt: new Date(0) });
  process.env.ORDER_EMAIL_FROM = 'Changed <changed@example.com>';
  mock.method(f.email, 'sendMessage', async (body, key) => { bodies.push(body); keys.push(key); return { id: 'resend-id', retryable: false }; });
  await new OrderEmailWorker(f.email).run();
  assert.deepEqual(bodies[0], bodies[1]); assert.equal(keys[0], keys[1]);
  await f.delivery.reload(); assert.equal(f.delivery.status, 'sent'); assert.equal(f.delivery.providerMessageId, 'resend-id');
  await new OrderEmailWorker(f.email).run(); assert.equal(bodies.length, 2);
});
test('MySQL: abandoned send lease is recovered; expired idempotency window requires review', async () => {
  const f = await paidFixture(); configured();
  await f.delivery.update({ status: 'sending', leaseUntil: new Date(0), leaseToken: 'old', attempts: 1,
    firstAttemptAt: new Date(), message: JSON.stringify(f.email.buildMessage(f.delivery.payload, process.env.ORDER_EMAIL_FROM)) });
  const send = mock.method(f.email, 'sendMessage', async () => ({ id: 'recovered', retryable: false }));
  await new OrderEmailWorker(f.email).run(); assert.equal(send.mock.callCount(), 1); assert.equal((await f.delivery.reload()).status, 'sent');
  const old = await paidFixture(); await old.delivery.update({ firstAttemptAt: new Date(Date.now() - 21 * 3600000), attempts: 1 });
  await new OrderEmailWorker(f.email).run(); assert.equal(send.mock.callCount(), 1); assert.equal((await old.delivery.reload()).status, 'failed');
});
test('MySQL: missing credentials do not consume attempts; refunded order does not send confirmation', async () => {
  const f = await paidFixture(); delete process.env.RESEND_API_KEY;
  const send = mock.method(f.email, 'sendMessage', async () => { throw new Error('must not send'); });
  await new OrderEmailWorker(f.email).run(); assert.equal((await f.delivery.reload()).attempts, 0);
  configured(); await f.order.update({ paymentStatus: 'refunded' });
  await new OrderEmailWorker(f.email).run(); assert.equal(send.mock.callCount(), 0); assert.equal((await f.delivery.reload()).lastError, 'order_not_confirmed');
});
