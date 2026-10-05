const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize, UniqueConstraintError } = require('sequelize');
const { normalizeCartItems } = require('../dist/catalog/cart-items');
const { PublicCheckoutService } = require('../dist/catalog/public-checkout.service');
const { PublicCartService } = require('../dist/catalog/public-cart.service');
const { CatalogService } = require('../dist/catalog/catalog.service');
const { MercadoPagoService } = require('../dist/catalog/mercado-pago.service');
const { ReservationWorker } = require('../dist/catalog/reservation-worker.service');
const { Order } = require('../dist/database/models/order.model');
const { OrderItem } = require('../dist/database/models/order-item.model');
const { Product } = require('../dist/database/models/product.model');
const { Commerce } = require('../dist/database/models/commerce.model');
const { StockMovement } = require('../dist/database/models/stock-movement.model');
const db = new Sequelize('mysql://test:test@localhost/test', { logging: false });
for (const model of [Order, OrderItem, Product, Commerce, StockMovement]) model.register(db);
afterEach(() => mock.restoreAll());
const input = () => ({ checkoutKey: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', customerName: 'Test', customerEmail: 'test@example.com', customerPhone: '123', deliveryMethod: 'pickup', items: [{ productId: 'p', quantity: 2 }] });
const row = data => ({ async update(values) { Object.assign(this, values); return this; }, get() { return { ...this }; }, ...data });
function fixture(stock = 10) {
  const state = { orders: [], lines: [], movements: [], stock, commits: 0, rollbacks: 0, creates: 0 };
  const product = row({ id: 'p', commerceId: 'c', name: 'Producto', sku: 'SKU', price: 100, offerPrice: null, currentStock: stock });
  let tail = Promise.resolve();
  mock.method(db, 'transaction', async callback => {
    const before = tail; let unlock; tail = new Promise(resolve => { unlock = resolve; }); await before;
    const snapshot = { stock: product.currentStock, orders: state.orders.length, lines: state.lines.length, movements: state.movements.length };
    const tx = { LOCK: { UPDATE: 'UPDATE' }, async commit() { state.commits++; unlock(); }, async rollback() { state.rollbacks++; product.currentStock = snapshot.stock; state.orders.length = snapshot.orders; state.lines.length = snapshot.lines; state.movements.length = snapshot.movements; unlock(); } };
    if (!callback) return tx;
    try { const result = await callback(tx); await tx.commit(); return result; } catch (error) { await tx.rollback(); throw error; }
  });
  mock.method(Commerce, 'findOne', async () => ({ id: 'c' }));
  mock.method(Order, 'findOne', async ({ where }) => state.orders.find(o => o.checkoutKey === where.checkoutKey) || null);
  mock.method(Order, 'create', async values => {
    if (state.orders.some(o => o.checkoutKey === values.checkoutKey)) throw new UniqueConstraintError({});
    const order = row({ id: `o${state.orders.length + 1}`, ...values }); state.orders.push(order); return order;
  });
  mock.method(Product, 'findOne', async options => { assert.equal(options.lock, 'UPDATE'); assert.ok(options.transaction); return row({ ...product, async update(values, options) { assert.ok(options.transaction); Object.assign(product, values); Object.assign(this, values); return this; } }); });
  mock.method(OrderItem, 'create', async values => { state.lines.push(values); });
  mock.method(StockMovement, 'create', async (values, options) => { assert.ok(options.transaction); state.movements.push(values); });
  const payment = { async createCheckout(order) { state.creates++; await order.update({ mpOrderId: 'mp', mpCheckoutUrl: 'https://payment.example' }); return { checkoutUrl: order.mpCheckoutUrl }; } };
  return { state, product, payment, service: new PublicCheckoutService(payment) };
}
test('groups duplicate products and rejects invalid/overflow quantities', () => {
  assert.deepEqual(normalizeCartItems([{ productId: 'b', quantity: 2 }, { productId: 'a', quantity: 1 }, { productId: 'b', quantity: 3 }]), [{ productId: 'a', quantity: 1 }, { productId: 'b', quantity: 5 }]);
  for (const quantity of [0, -1, 1.5, '2', Infinity, 2147483648]) assert.throws(() => normalizeCartItems([{ productId: 'p', quantity }]));
  assert.throws(() => normalizeCartItems({}));
});
test('cart validation uses the combined quantity', async () => {
  mock.method(Commerce, 'findOne', async () => ({ id: 'c' }));
  mock.method(Product, 'findAll', async () => [{ id: 'p', currentStock: 3 }]);
  const result = await new PublicCartService().validateCart('demo', [{ productId: 'p', quantity: 2 }, { productId: 'p', quantity: 2 }]);
  assert.equal(result.valid, false); assert.equal(result.items.length, 1);
});
test('checkout repeated lines create one line and reserve the full sum', async () => {
  const f = fixture(); const request = input(); request.items.push({ productId: 'p', quantity: 3 });
  await f.service.createOrder('demo', request);
  assert.equal(f.product.currentStock, 5); assert.equal(f.state.lines.length, 1); assert.equal(f.state.lines[0].quantity, 5); assert.equal(f.state.orders[0].total, 500);
});
test('combined quantity exceeding stock rolls back without initiating payment', async () => {
  const f = fixture(3); const request = input(); request.items.push({ productId: 'p', quantity: 2 });
  await assert.rejects(f.service.createOrder('demo', request), /disponibilidad/);
  assert.equal(f.product.currentStock, 3); assert.equal(f.state.orders.length, 0); assert.equal(f.state.creates, 0);
});
test('same key replays the original order and rejects a changed payload', async () => {
  const f = fixture(); const first = await f.service.createOrder('demo', input()); const retry = await f.service.createOrder('demo', input());
  assert.equal(first.order.id, retry.order.id); assert.equal(f.state.creates, 1); assert.equal(f.product.currentStock, 8);
  await assert.rejects(f.service.createOrder('demo', { ...input(), customerName: 'Changed' }), /otros datos/);
});
test('concurrent checkout retries reserve once (transaction/unique-key simulation)', async () => {
  const f = fixture(); const results = await Promise.allSettled([f.service.createOrder('demo', input()), f.service.createOrder('demo', input())]);
  assert.equal(f.state.orders.length, 1); assert.equal(f.state.creates, 1); assert.equal(f.product.currentStock, 8);
  assert.ok(results.some(result => result.status === 'fulfilled'));
});
test('ambiguous MP failure retains reservation and retry never creates a second preference', async () => {
  const f = fixture(); mock.method(console, 'error', () => {}); f.payment.createCheckout = async () => { f.state.creates++; throw new Error('timeout'); };
  await assert.rejects(f.service.createOrder('demo', input()), /inicio del pago/);
  await assert.rejects(f.service.createOrder('demo', input()), /preparando/);
  assert.equal(f.state.creates, 1); assert.equal(f.product.currentStock, 8); assert.equal(f.state.rollbacks, 0);
});
test('stock adjustment rolls back if the movement cannot be saved', async () => {
  const f = fixture(); mock.method(StockMovement, 'create', async () => { throw new Error('movement failed'); });
  await assert.rejects(new CatalogService().adjustStock('c', 'u', 'p', { quantityChange: -2 }), /movement failed/);
  assert.equal(f.product.currentStock, 10); assert.equal(f.state.rollbacks, 1);
});
test('concurrent adjustment and checkout retain both changes (locking simulation)', async () => {
  const f = fixture(); await Promise.all([f.service.createOrder('demo', input()), new CatalogService().adjustStock('c', 'u', 'p', { quantityChange: 5 })]);
  assert.equal(f.product.currentStock, 13); assert.equal(f.state.movements.length, 2);
});
function expired() { return row({ id: 'o', status: 'pending_payment', paymentStatus: 'pending', reservationExpiresAt: new Date(Date.now() - 40 * 60_000) }); }
for (const status of ['pending', 'in_process', 'authorized', 'unknown']) test(`expiry retains reservation for ${status} payment`, async () => {
  const service = new MercadoPagoService({}); mock.method(service, 'searchPayments', async () => [{ id: 'mp', status }]); const release = mock.method(service, 'releaseReservation', async () => {});
  await service.reconcileExpiredReservation(expired()); assert.equal(release.mock.callCount(), 0);
});
test('expiry releases only terminal/no payment results', async () => {
  const service = new MercadoPagoService({}); const search = mock.method(service, 'searchPayments', async () => []); const release = mock.method(service, 'releaseReservation', async () => {});
  await service.reconcileExpiredReservation(expired()); search.mock.mockImplementation(async () => [{ status: 'rejected' }, { status: 'cancelled' }]); await service.reconcileExpiredReservation(expired()); assert.equal(release.mock.callCount(), 2);
});
test('MP lookup failure and incomplete search never release stock', async () => {
  const service = new MercadoPagoService({}); mock.method(service, 'accessToken', () => 'test'); mock.method(global, 'fetch', async () => ({ ok: true, json: async () => ({ results: [], paging: { total: 101 } }) })); const release = mock.method(service, 'releaseReservation', async () => {});
  await assert.rejects(service.reconcileExpiredReservation(expired()), /Incomplete/); assert.equal(release.mock.callCount(), 0);
});
test('approved payment reconciles before any stock release', async () => {
  const service = new MercadoPagoService({}); mock.method(service, 'searchPayments', async () => [{ id: 7, status: 'approved' }]); const process = mock.method(service, 'processPaymentNotification', async () => {}); const release = mock.method(service, 'releaseReservation', async () => {});
  await service.reconcileExpiredReservation(expired()); assert.equal(process.mock.callCount(), 1); assert.equal(release.mock.callCount(), 0);
});
test('grace period retains reservation', async () => {
  const service = new MercadoPagoService({}); const search = mock.method(service, 'searchPayments', async () => []);
  await service.reconcileExpiredReservation({ ...expired(), reservationExpiresAt: new Date(Date.now() - 60_000) }); assert.equal(search.mock.callCount(), 0);
});
test('late approval flags manual review instead of confirming released stock', async () => {
  fixture(); const order = row({ id: 'o', status: 'cancelled', paymentStatus: 'cancelled' });
  mock.method(Order, 'findByPk', async () => order); const movements = mock.method(StockMovement, 'update', async () => { throw new Error('must not sell released stock'); }); mock.method(console, 'error', () => {});
  await new MercadoPagoService({}).confirmPaidOrder(order);
  assert.equal(order.paymentStatus, 'paid'); assert.equal(order.status, 'cancelled'); assert.equal(order.paymentReviewRequired, true); assert.equal(movements.mock.callCount(), 0);
});
test('simultaneous expiry workers release once (order-lock simulation)', async () => {
  const f = fixture(); const order = row({ ...expired(), commerceId: 'c', orderNumber: 'ORDER' });
  mock.method(Order, 'findByPk', async () => order); mock.method(OrderItem, 'findAll', async () => [{ productId: 'p', quantity: 2 }]); mock.method(Product, 'findByPk', async () => f.product);
  const service = new MercadoPagoService({}); await Promise.all([service.releaseReservation({ ...order }, 'cancelled'), service.releaseReservation({ ...order }, 'cancelled')]);
  assert.equal(f.product.currentStock, 12); assert.equal(f.state.movements.length, 1); assert.equal(order.status, 'cancelled');
});
test('worker continues after one failed order', async () => {
  mock.method(console, 'error', () => {}); mock.method(Order, 'findAll', async () => [row({ id: 'one' }), row({ id: 'two' })]); const visited = [];
  await new ReservationWorker({ async reconcileExpiredReservation(order) { visited.push(order.id); if (order.id === 'one') throw new Error('offline'); } }).run();
  assert.deepEqual(visited, ['one', 'two']);
});
