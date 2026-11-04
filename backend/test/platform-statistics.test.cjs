const { test, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { PlatformStatisticsService } = require('../dist/platform/platform-statistics.service');
const { PlatformOwnerService } = require('../dist/platform/platform-owner.service');
const { PlatformController, PlatformOwnerGuard } = require('../dist/platform/platform.controller');
const { GUARDS_METADATA } = require('@nestjs/common/constants');
afterEach(() => mock.restoreAll());

test('rejects shop paths, bad sessions and identifiable bots before any database write', async () => {
  const stats = new PlatformStatisticsService({ sequelize: { transaction: () => assert.fail('no database write') } });
  await stats.record('/tienda/demo', 'a'.repeat(32), 'human');
  await stats.record('/registro', 'bad', 'human');
  await stats.record('/registro', 'a'.repeat(32), 'Googlebot');
});

test('platform statistics do not accept a normal merchant token, even if signed by the same key', () => {
  const old = { secret: process.env.JWT_SECRET, email: process.env.PLATFORM_REGISTRATION_ALERT_EMAIL };
  process.env.JWT_SECRET = 'unit-test-secret'; process.env.PLATFORM_REGISTRATION_ALERT_EMAIL = 'owner@example.com';
  try {
    const owner = new PlatformOwnerService({}, {});
    const merchant = jwt.sign({ role: 'admin', commerceId: 'shop' }, process.env.JWT_SECRET, { subject: 'owner' });
    assert.throws(() => owner.authorize('Bearer ' + merchant), /Ingresá nuevamente/);
    assert.throws(() => owner.authorize(undefined), /Ingresá nuevamente/);
  } finally {
    for (const [key, value] of [['JWT_SECRET', old.secret], ['PLATFORM_REGISTRATION_ALERT_EMAIL', old.email]])
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

test('the statistics endpoint requires the platform owner guard', () => {
  const guards = Reflect.getMetadata(GUARDS_METADATA, PlatformController.prototype.statistics);
  assert.ok(guards.includes(PlatformOwnerGuard));
});

test('owner filter excludes the chosen browser and safely handles IP fallback', () => {
  const { excludedVisitor, publicIp } = require('../dist/platform/platform-statistics.service');
  const filter = { browser_hash: 'browser', ip_hash: 'address' };
  assert.equal(excludedVisitor(filter, 'browser', null), true);
  assert.equal(excludedVisitor(filter, 'other', 'address'), true);
  assert.equal(excludedVisitor(filter, 'other', 'different'), false);
  assert.equal(excludedVisitor(undefined, 'browser', 'address'), false);
  assert.equal(publicIp('192.168.1.1'), null);
  assert.equal(publicIp('127.0.0.1'), null);
  assert.equal(publicIp('8.8.8.8'), '8.8.8.8');
  assert.equal(publicIp('malformed-ip'), null);
});

test('owner exclusion creates one baseline and never erases historical visitor totals', async () => {
  const executed = [];
  const db = { sequelize: {
    transaction: async cb => cb({}),
    query: async (sql) => {
      executed.push(sql);
      if (sql.includes('SELECT * FROM platform_traffic_filter')) return [];
      if (sql.includes('SELECT page_views')) return [{ page_views: 18, sessions: 7, register_views: 3 }];
      return [];
    },
  }};
  const stats = new PlatformStatisticsService(db);
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'mock-test-secret';
  const result = await stats.excludeOwner('a'.repeat(32), '8.8.8.8', new Date('2026-10-28T12:00:00.000Z'));
  if (previous === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous;
  assert.equal(result.active, true);
  assert.equal(result.ipExcluded, true);
  assert.ok(executed.some(sql => sql.includes('INSERT INTO platform_traffic_filter')));
  assert.ok(!executed.some(sql => /DELETE FROM platform_visit_totals/i.test(sql)));
});

test('exact IP exclusions keep multiple addresses and do not suppress other visitors', async () => {
  const selected = new Set(['8.8.8.8', '1.1.1.1']);
  const updates = [];
  const db = { sequelize: { transaction: async cb => cb({}), query: async (sql, options = {}) => {
    if (sql.includes('SELECT ip_hash, browser_hash')) return [];
    if (sql.includes('SELECT ip_address FROM platform_excluded_ips'))
      return selected.has(options.replacements.address) ? [{ ip_address: options.replacements.address }] : [];
    if (sql.includes('ROW_COUNT()')) return [{ inserted: 1 }];
    if (sql.includes('INSERT INTO platform_visit_totals')) updates.push(options.replacements);
    return [];
  } } };
  const service = new PlatformStatisticsService(db);
  await service.record('/', 'a'.repeat(32), 'human', new Date(), '8.8.8.8');
  await service.record('/', 'b'.repeat(32), 'human', new Date(), '1.1.1.1');
  await service.record('/', 'c'.repeat(32), 'human', new Date(), '8.8.8.9');
  assert.equal(updates.length, 1);
});

test('adding a second exact IP does not replace existing filters or reset baseline', async () => {
  const entries = new Map([['8.8.8.8', 'Casa']]);
  const statements = [];
  const db = { sequelize: { query: async (sql, options = {}) => {
    statements.push(sql);
    if (sql.includes('SELECT id FROM platform_traffic_filter')) return [{ id: 1 }];
    if (sql.startsWith('INSERT INTO platform_excluded_ips')) entries.set(options.replacements.address, options.replacements.label);
    return [];
  } } };
  const service = new PlatformStatisticsService(db);
  await service.addExcludedIp('1.1.1.1', 'Celular', 'a'.repeat(32));
  assert.deepEqual([...entries.keys()], ['8.8.8.8', '1.1.1.1']);
  assert.ok(!statements.some(sql => /UPDATE platform_traffic_filter|DELETE FROM platform_visit_totals/.test(sql)));
  await assert.rejects(() => service.addExcludedIp('30.30.100', 'Parcial', 'a'.repeat(32)), /IP pública completa/);
  await assert.rejects(() => service.addExcludedIp('192.168.0.1', 'Local', 'a'.repeat(32)), /IP pública completa/);
});

test('IP list and modifications require the platform owner guard', () => {
  for (const name of ['excludedIps', 'addExcludedIp', 'removeExcludedIp']) {
    const guards = Reflect.getMetadata(GUARDS_METADATA, PlatformController.prototype[name]);
    assert.ok(guards.includes(PlatformOwnerGuard));
  }
});

test('visit detection uses the Render edge header instead of untrusted X-Forwarded-For', async () => {
  let actual;
  const controller = new PlatformController({ record: async (...args) => { actual = args[4]; } }, {});
  await controller.visit({path:'/',sessionId:'a'.repeat(32)}, 'human', {headers:{'cf-connecting-ip':'1.1.1.1','x-forwarded-for':'8.8.8.8'}});
  assert.equal(actual, '1.1.1.1');
  await controller.visit({path:'/',sessionId:'a'.repeat(32)}, 'human', {headers:{'x-forwarded-for':'8.8.8.8'}});
  assert.equal(actual, undefined);
});
