const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { RegistrationEmailService, registrationAlertAddress } = require('../dist/auth/registration-email.service');
const { RegistrationEmailWorker } = require('../dist/auth/registration-email-worker.service');
const { RegistrationEmailDelivery } = require('../dist/database/models/registration-email-delivery.model');

afterEach(() => mock.restoreAll());
const payload = { commerceName: '<Tienda>', slug: 'mi-tienda', adminName: '<Cristian>', email: 'owner@example.com', trialEndsAt: '2026-11-11T12:00:00.000Z' };

test('welcome email explains the actual trial, next steps and optional price without unsafe markup', () => {
  const message = new RegistrationEmailService().buildWelcomeMessage(payload, 'from@example.com');
  assert.deepEqual(message.to, ['owner@example.com']);
  assert.ok(message.text.includes('15 días gratis'));
  assert.ok(message.text.includes('$39.900 ARS por mes'));
  assert.ok(message.text.includes('No se genera un cobro hasta que autorices'));
  assert.ok(message.text.includes('11 de noviembre de 2026'));
  assert.ok(message.text.includes('https://disenolys.store/admin/personalizar'));
  assert.ok(message.text.includes('https://disenolys.store/tienda/mi-tienda'));
  assert.ok(message.html.includes('&lt;Cristian&gt;'));
  assert.ok(!message.html.includes('<Cristian>'));
});

test('registration alert is addressed only to an explicitly configured valid email', () => {
  assert.equal(registrationAlertAddress(undefined), null);
  assert.equal(registrationAlertAddress('bad\nother@example.com'), null);
  assert.equal(registrationAlertAddress(' Admin@Example.com '), 'admin@example.com');
  const message = new RegistrationEmailService().buildPlatformMessage(payload, 'from@example.com', 'alerts@example.com');
  assert.deepEqual(message.to, ['alerts@example.com']);
  assert.ok(message.text.includes('owner@example.com'));
  assert.ok(message.html.includes('&lt;Tienda&gt;'));
});

test('when no platform address is configured, the worker can claim welcome messages without claiming alerts', async () => {
  let options;
  mock.method(RegistrationEmailDelivery, 'findOne', async o => { options=o; return null; });
  const worker = new RegistrationEmailWorker({sequelize:{transaction:async cb=>cb({LOCK:{UPDATE:'UPDATE'}})}}, new RegistrationEmailService(), {});
  assert.equal(await worker.claim(null), null);
  assert.equal(options.where.audience, 'welcome');
});

test('provider confirmation marks a welcome sent and removes the stored message and recipient payload', async () => {
  const old = { ...process.env };
  process.env.RESEND_API_KEY='test-only';process.env.ORDER_EMAIL_FROM='from@example.com';delete process.env.PLATFORM_REGISTRATION_ALERT_EMAIL;
  let calls=0, updated;
  const delivery={id:'mail-id',message:'{"to":["owner@example.com"]}',attempts:1,leaseToken:'lease'};
  const worker=new RegistrationEmailWorker({}, {}, {sendMessage:async (message,key)=>{assert.equal(key,'registration/mail-id');assert.equal(message,delivery.message);return {id:'accepted',retryable:false};}});
  mock.method(worker,'claim',async address=>{assert.equal(address,null);return calls++===0?delivery:null});
  mock.method(RegistrationEmailDelivery,'update',async (values,options)=>{updated={values,options}});
  try {
    await worker.run();assert.equal(updated.values.status,'sent');assert.deepEqual(updated.values.payload,{});assert.equal(updated.values.message,null);assert.equal(updated.options.where.leaseToken,'lease');
  } finally { process.env=old; }
});

test('temporary provider failure stays pending with the same delivery and retryable message', async () => {
  const old = { ...process.env };
  process.env.RESEND_API_KEY='test-only';process.env.ORDER_EMAIL_FROM='from@example.com';delete process.env.PLATFORM_REGISTRATION_ALERT_EMAIL;
  let calls=0, updated;
  const delivery={id:'retry-id',message:'same-message',attempts:1,leaseToken:'lease'};
  const worker=new RegistrationEmailWorker({}, {}, {sendMessage:async (message,key)=>{
    assert.equal(key,'registration/retry-id');assert.equal(message,'same-message');return {retryable:true,error:'provider_http_503'};
  }});
  mock.method(worker,'claim',async()=>calls++===0?delivery:null);
  mock.method(RegistrationEmailDelivery,'update',async values=>{updated=values});
  try {await worker.run();assert.equal(updated.status,'pending');assert.equal(updated.lastError,'provider_http_503');assert.equal(updated.message,undefined);assert.equal(updated.payload,undefined);}
  finally {process.env=old;}
});
