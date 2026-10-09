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
  const checkout = new PublicCheckoutService({ async prepareCheckout() { return { collectorId: '123' }; }, async createCheckout(order) {
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
  assert.deepEqual(versions.map(row => row.version).sort(), ['001_baseline','002_legacy_checkout','003_email_outbox','004_customer_accounts','005_commerce_branding', '006_commerce_payments', '007_password_recovery']);
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

const { AdminOrdersService } = require('../dist/catalog/admin-orders.service');
test('MySQL: order panel isolates commerce detail and mutations', async () => {
  const f = await paidFixture(); const other = await fixture(); const admin = new AdminOrdersService();
  await assert.rejects(admin.detail(other.commerce.id, f.order.id), /no encontrado/);
  await assert.rejects(admin.updateStatus(other.commerce.id, other.user.id, f.order.id, 'cancelled'), /no encontrado/);
  const list = await admin.list(other.commerce.id, 'all', f.order.orderNumber, 'all', '1');
  assert.equal(list.total, 0);
});
test('MySQL: pickup skips shipping and rejects backwards/unpaid transitions', async () => {
  const f = await paidFixture(); const admin = new AdminOrdersService();
  await assert.rejects(admin.updateStatus(f.commerce.id, f.user.id, f.order.id, 'delivered'), /no está permitido/);
  await admin.updateStatus(f.commerce.id, f.user.id, f.order.id, 'preparing');
  await assert.rejects(admin.updateStatus(f.commerce.id, f.user.id, f.order.id, 'shipped'), /no está permitido/);
  await admin.updateStatus(f.commerce.id, f.user.id, f.order.id, 'delivered');
  await assert.rejects(admin.updateStatus(f.commerce.id, f.user.id, f.order.id, 'cancelled'), /no está permitido/);
  const unpaid = await fixture(); const result = await unpaid.checkout.createOrder(unpaid.commerce.slug, unpaid.request);
  await assert.rejects(admin.updateStatus(unpaid.commerce.id, unpaid.user.id, result.order.id, 'cancelled'), /no está permitido/);
});
test('MySQL: concurrent admin cancellations return stock once and preserve paid status', async () => {
  const f = await paidFixture(); const admin = new AdminOrdersService();
  await Promise.all([admin.updateStatus(f.commerce.id, f.user.id, f.order.id, 'cancelled'), admin.updateStatus(f.commerce.id, f.user.id, f.order.id, 'cancelled')]);
  assert.equal((await f.product.reload()).currentStock, 10);
  await f.order.reload(); assert.equal(f.order.status, 'cancelled'); assert.equal(f.order.paymentStatus, 'paid'); assert.equal(f.order.paymentReviewRequired, true);
  assert.equal(await StockMovement.count({where:{productId:f.product.id,type:'return'}}), 1);
});
test('MySQL: payment filters, pagination validation and email detail', async () => {
  const f = await paidFixture(); const admin = new AdminOrdersService();
  const list = await admin.list(f.commerce.id, 'confirmed', undefined, 'paid', '1');
  assert.equal(list.total, 1); assert.equal(list.orders[0].id, f.order.id);
  const detail = await admin.detail(f.commerce.id, f.order.id); assert.equal(detail.email.status, 'pending');
  await assert.rejects(admin.list(f.commerce.id, 'all', undefined, 'unknown', '1'), /inválido/);
  await assert.rejects(admin.list(f.commerce.id, 'all', undefined, 'all', '-1'), /inválida/);
});

const { MpConnectionService } = require('../dist/catalog/mp-connection.service');
const { MpConnection, MpOAuthState } = require('../dist/database/models/mp-connection.model');
const { createHash } = require('node:crypto');
process.env.MP_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString('base64');
process.env.MP_CLIENT_ID = 'test-client';
process.env.MP_CLIENT_SECRET = 'test-secret';
process.env.MP_OAUTH_REDIRECT_URI = 'https://shop.example/admin/configuracion';
function mockOAuth(seller) {
  return mock.method(global, 'fetch', async () => ({ ok: true, json: async () => ({ access_token: 'access-secret', refresh_token: 'refresh-secret', user_id: seller, expires_in: 3600 }) }));
}
test('MySQL OAuth: state rejects another commerce/user, is consumed once and stores encrypted tokens', async () => {
  const a = await fixture(), b = await fixture(), service = new MpConnectionService();
  const { url } = await service.start(a.commerce.id, a.user.id);
  const state = new URL(url).searchParams.get('state');
  const provider = mockOAuth(10001);
  await assert.rejects(service.finish(b.commerce.id, b.user.id, state, 'code'), /otra sesión/);
  await assert.rejects(service.finish(a.commerce.id, b.user.id, state, 'code'), /otra sesión/);
  assert.equal(provider.mock.callCount(), 0);
  const result = await service.finish(a.commerce.id, a.user.id, state, 'code');
  assert.equal(result.connected, true); assert.equal(result.collectorId, '10001');
  assert.equal(result.credentials, undefined);
  const row = await MpConnection.findByPk(a.commerce.id);
  assert.ok(!row.credentials.includes('access-secret'));
  await assert.rejects(service.finish(a.commerce.id, a.user.id, state, 'code'), /venció/);
  assert.equal(provider.mock.callCount(), 1);
});
test('MySQL OAuth: expired authorization never calls provider', async () => {
  const a = await fixture(), service = new MpConnectionService();
  const { url } = await service.start(a.commerce.id, a.user.id), state = new URL(url).searchParams.get('state');
  await MpOAuthState.update({ expiresAt: new Date(0) }, { where: { id: createHash('sha256').update(state).digest('hex') } });
  const provider = mockOAuth(10002);
  await assert.rejects(service.finish(a.commerce.id, a.user.id, state, 'code'), /venció/);
  assert.equal(provider.mock.callCount(), 0);
});
test('MySQL OAuth: concurrent token requests refresh once and keep commerce ownership', async () => {
  const a = await fixture(), service = new MpConnectionService();
  await MpConnection.create({ commerceId: a.commerce.id, collectorId: '10003', credentials: service.encrypt(JSON.stringify({ access_token: 'old', refresh_token: 'refresh' }), a.commerce.id), expiresAt: new Date(0) });
  const provider = mockOAuth(10003);
  const results = await Promise.all([service.credentials(a.commerce.id), service.credentials(a.commerce.id)]);
  assert.equal(provider.mock.callCount(), 1);
  assert.ok(results.every(result => result.collectorId === '10003' && result.token === 'access-secret'));
});
test('MySQL OAuth: one seller cannot connect two commerces or replace an existing seller', async () => {
  const a = await fixture(), b = await fixture(), service = new MpConnectionService();
  const provider = mockOAuth(10004);
  async function connect(f) {
    const { url } = await service.start(f.commerce.id, f.user.id);
    return service.finish(f.commerce.id, f.user.id, new URL(url).searchParams.get('state'), 'code');
  }
  await connect(a);
  await assert.rejects(connect(b), /otro comercio/);
  provider.mock.mockImplementation(async () => ({ ok: true, json: async () => ({ access_token: 'new', refresh_token: 'refresh', user_id: 10005, expires_in: 3600 }) }));
  await assert.rejects(connect(a), /cuenta original/);
  assert.equal((await service.status(a.commerce.id)).collectorId, '10004');
});
test('MySQL OAuth: checkout without connection creates no order and reserves no stock', async () => {
  const f = await fixture(), service = new PublicCheckoutService(new MercadoPagoService({}, new MpConnectionService()));
  await assert.rejects(service.createOrder(f.commerce.slug, f.request), /no conectó/);
  assert.equal(await Order.count({ where: { commerceId: f.commerce.id } }), 0);
  assert.equal((await f.product.reload()).currentStock, 10);
});

test('MySQL store links: catalog, detail and cart remain isolated by commerce slug', async () => {
  const { PublicCatalogService } = require('../dist/catalog/public-catalog.service');
  const { PublicCartService } = require('../dist/catalog/public-cart.service');
  const a = await fixture(), b = await fixture();
  await a.product.update({ published: true, active: true });
  await b.product.update({ published: true, active: true });
  const catalog = new PublicCatalogService(), cart = new PublicCartService();
  for (const [own, other] of [[a, b], [b, a]]) {
    const result = await catalog.getCatalog(own.commerce.slug);
    assert.deepEqual(result.products.map(p => p.id), [own.product.id]);
    assert.equal((await cart.getProduct(own.commerce.slug, own.product.id)).id, own.product.id);
    await assert.rejects(cart.getProduct(own.commerce.slug, other.product.id), /Producto no encontrado/);
    assert.equal((await cart.validateCart(own.commerce.slug, [{ productId: other.product.id, quantity: 1 }])).valid, false);
    assert.equal((await own.checkout.createOrder(own.commerce.slug, { ...own.request, items: [{ productId: other.product.id, quantity: 1 }] }).then(() => true, () => false)), false);
  }
  await b.commerce.update({ active: false });
  await assert.rejects(catalog.getCatalog(b.commerce.slug), /Comercio no encontrado/);
  await assert.rejects(catalog.getCatalog(randomUUID()), /Comercio no encontrado/);
});

const { PasswordRecoveryService } = require('../dist/auth/password-recovery.service');
const { Session } = require('../dist/database/models/session.model');
const bcrypt = require('bcryptjs');
function recoveryService() {
  process.env.FRONTEND_URL = 'https://shop.example';
  process.env.RESEND_API_KEY = 'test-only';
  process.env.ORDER_EMAIL_FROM = 'test@example.invalid';
  const service = new PasswordRecoveryService(db), messages = [];
  mock.method(service, 'send', async (to, subject, text) => { messages.push({ to, subject, text }); });
  mock.method(service, 'drain', async () => {});
  return { service, messages };
}
async function recoveryFixture() {
  const f = await fixture();
  await f.user.update({ passwordHash: await bcrypt.hash('old-password-for-test', 4) });
  await Session.create({ id: randomUUID(), userId: f.user.id, expiresAt: new Date(Date.now()+3600000) });
  return f;
}
function requestScope(f, audience='admin') { return { email: f.user.email, slug: f.commerce.slug, audience }; }
async function link(service, messages, f, audience='admin') {
  await service.issue(requestScope(f, audience));
  return messages.at(-1).text.match(/#token=([a-f0-9]{64})/)[1];
}
function resetBody(f, token, audience='admin') {
  return { token, commerceSlug: f.commerce.slug, audience, password: 'a new safe password 123', confirmPassword: 'a new safe password 123' };
}
test('MySQL recovery: hashed tokens, correct tenant and role, one concurrent use and all sessions revoked', async () => {
  const f = await recoveryFixture(), other = await fixture(), { service, messages } = recoveryService();
  const token = await link(service, messages, f);
  const [rows] = await db.sequelize.query('SELECT * FROM password_reset_tokens WHERE user_id=?', { replacements:[f.user.id] });
  assert.equal(rows[0].token_hash, createHash('sha256').update(token).digest('hex'));
  assert.ok(!JSON.stringify(rows).includes(token));
  const payload = resetBody(f, token), ip = randomUUID();
  await assert.rejects(service.reset({ ...payload, commerceSlug: other.commerce.slug }, ip), /no es válido/);
  await assert.rejects(service.reset({ ...payload, audience:'customer' }, ip), /no es válido/);
  const results = await Promise.allSettled([service.reset(payload, ip), service.reset(payload, ip)]);
  assert.equal(results.filter(x => x.status==='fulfilled').length, 1);
  assert.ok(await bcrypt.compare(payload.password, (await f.user.reload()).passwordHash));
  assert.equal(await Session.count({ where:{ userId:f.user.id, revokedAt:null } }), 0);
  await assert.rejects(service.reset(payload, ip), /no es válido/);
});
test('MySQL recovery: expired, superseded, inactive and changed-password tokens cannot reset', async () => {
  const f = await recoveryFixture(), { service, messages } = recoveryService(), ip = randomUUID();
  const first = await link(service, messages, f), second = await link(service, messages, f);
  await assert.rejects(service.reset(resetBody(f, first), ip), /no es válido/);
  await db.sequelize.query('UPDATE password_reset_tokens SET expires_at=DATE_SUB(NOW(),INTERVAL 1 MINUTE) WHERE user_id=?', { replacements:[f.user.id] });
  await assert.rejects(service.reset(resetBody(f, second), ip), /no es válido/);
  const third = await link(service, messages, f);
  await f.user.update({ active:false });
  await assert.rejects(service.reset(resetBody(f, third), ip), /no es válido/);
  await f.user.update({ active:true, passwordHash:await bcrypt.hash('another password',4) });
  await assert.rejects(service.reset(resetBody(f, third), ip), /no es válido/);
});
test('MySQL recovery: unknown accounts have identical queued response, per-email limit survives service replacement', async () => {
  const f=await fixture(), {service}=recoveryService(), ip=randomUUID();
  const payload={ email:f.user.email, commerceSlug:f.commerce.slug, audience:'admin' };
  const existing=await service.request(payload,ip);
  const missing=await service.request({...payload,email:`${randomUUID()}@example.invalid`},ip);
  assert.deepEqual(existing,missing);
  await service.request(payload,ip); await service.request(payload,ip);
  const replacement=new PasswordRecoveryService(db);
  mock.method(replacement,'drain',async()=>{});
  assert.deepEqual(await replacement.request(payload,ip),existing);
  const [rows]=await db.sequelize.query('SELECT COUNT(*) AS n FROM password_reset_requests WHERE email=?',{replacements:[f.user.email]});
  assert.equal(rows[0].n,3);
  await new Promise(resolve=>setImmediate(resolve));
});
test('MySQL recovery: customer path works and overlong UTF-8 passwords or mismatches are rejected', async () => {
  const f=await recoveryFixture(), {service,messages}=recoveryService(), ip=randomUUID();
  await f.user.update({role:'customer'});
  await service.issue(requestScope(f)); assert.equal(messages.length,0);
  const token=await link(service,messages,f,'customer'), payload=resetBody(f,token,'customer');
  await assert.rejects(service.reset({...payload,password:'🔐'.repeat(20),confirmPassword:'🔐'.repeat(20)},ip),/72 bytes/);
  await assert.rejects(service.reset({...payload,confirmPassword:'different'},ip),/misma contraseña/);
  await service.reset(payload,ip);
  assert.ok(await bcrypt.compare(payload.password,(await f.user.reload()).passwordHash));
});

test('MySQL recovery: durable worker delivers without storing plaintext tokens and retries provider failure', async () => {
  await db.sequelize.query('DELETE FROM password_reset_requests');
  const f=await fixture(), service=new PasswordRecoveryService(db), id=randomUUID();
  let fail=true; const messages=[];
  mock.method(service,'send',async(to,subject,text)=>{ if(fail) throw new Error('provider'); messages.push(text); });
  await db.sequelize.query(`INSERT INTO password_reset_requests(id,email,slug,audience,available_at,expires_at)
    VALUES (?,?,?,'admin',NOW(),DATE_ADD(NOW(),INTERVAL 10 MINUTE))`,{replacements:[id,f.user.email,f.commerce.slug]});
  await service.drain();
  let [rows]=await db.sequelize.query('SELECT * FROM password_reset_requests WHERE id=?',{replacements:[id]});
  assert.equal(rows.length,1); assert.equal(rows[0].attempts,1);
  fail=false;
  await db.sequelize.query('UPDATE password_reset_requests SET available_at=NOW() WHERE id=?',{replacements:[id]});
  await service.drain();
  [rows]=await db.sequelize.query('SELECT * FROM password_reset_requests WHERE id=?',{replacements:[id]});
  assert.equal(rows.length,0); assert.equal(messages.length,1);
  assert.match(messages[0],/https:\/\/shop.example\/recuperar#token=/);
});
test('MySQL recovery: a login checked before password reset cannot mint a session afterwards', async () => {
  const {AuthService}=require('../dist/auth/auth.service');
  const f=await recoveryFixture(), stale=await User.findByPk(f.user.id), {service,messages}=recoveryService();
  const token=await link(service,messages,f);
  await service.reset(resetBody(f,token),randomUUID());
  await assert.rejects(new AuthService(db).createSession(stale),/Credenciales inválidas/);
  assert.equal(await Session.count({where:{userId:f.user.id,revokedAt:null}}),0);
});
