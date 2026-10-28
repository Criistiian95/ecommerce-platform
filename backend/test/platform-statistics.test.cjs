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
