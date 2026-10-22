const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function setup(fetch, token = 'session-fixture') {
  const values = new Map([
    ['ecommerce_token', token],
    ['customer_token', 'separate-customer-session'],
  ]);
  if (token === null) values.delete('ecommerce_token');
  const events = [];
  const sandbox = {
    exports: {}, fetch, Event,
    window: {
      localStorage: { getItem: key => values.get(key) ?? null, removeItem: key => values.delete(key) },
      dispatchEvent: event => { events.push(event.type); },
    },
  };
  vm.runInNewContext(ts.transpileModule(
    fs.readFileSync(require.resolve('../app/admin/session.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText, sandbox);
  return { ...sandbox.exports, values, events };
}

test('logout navigates immediately even while server revocation is pending', async () => {
  let finish;
  let request;
  let navigated = false;
  const pending = new Promise(resolve => { finish = resolve; });
  const session = setup((url, options) => {
    assert.equal(navigated, true);
    request = { url, options };
    return pending;
  });
  session.logoutAdminSession('https://api.example.org', () => {
    assert.equal(session.values.has('ecommerce_token'), false);
    assert.deepEqual(session.events, ['disenolys:admin-logout']);
    navigated = true;
  });
  assert.equal(navigated, true);
  assert.equal(session.values.get('customer_token'), 'separate-customer-session');
  assert.equal(request.url, 'https://api.example.org/auth/admin/logout');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.keepalive, true);
  assert.equal(request.options.headers.Authorization, 'Bearer session-fixture');
  finish({ ok: true });
  await pending;
});

test('offline, failed or synchronously rejected revocation never restores the local session', async () => {
  for (const fetch of [
    () => Promise.reject(new Error('offline')),
    () => Promise.resolve({ ok: false, status: 503 }),
    () => { throw new Error('network unavailable'); },
  ]) {
    const session = setup(fetch);
    let navigated = false;
    session.logoutAdminSession('https://api.example.org', () => { navigated = true; });
    await Promise.resolve();
    assert.equal(navigated, true);
    assert.equal(session.values.has('ecommerce_token'), false);
  }
});

test('logout without an admin token navigates without sending a request', () => {
  const session = setup(() => { assert.fail('No token must mean no revocation request'); }, null);
  let navigated = false;
  session.logoutAdminSession('https://api.example.org', () => { navigated = true; });
  assert.equal(navigated, true);
  assert.equal(session.values.get('customer_token'), 'separate-customer-session');
});
