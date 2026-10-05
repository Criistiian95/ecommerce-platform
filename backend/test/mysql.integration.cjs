const { test, before, after } = require('node:test');
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
before(async () => { await db.onModuleInit(); });
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
test('MySQL: existing schema upgrades before sync and restart is repeatable', async () => {
  for (const column of ['checkout_key', 'checkout_hash', 'reservation_expires_at', 'reservation_checked_at', 'payment_review_required']) {
    await db.sequelize.query(`ALTER TABLE orders DROP COLUMN ${column}`);
  }
  await db.onModuleInit();
  await db.onModuleInit();
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
