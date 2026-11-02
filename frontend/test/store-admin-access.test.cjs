const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function access({ tenant, signedIn, centralOrigin }) {
  const changes = [];
  let index = 0;
  const code = ts.transpileModule(fs.readFileSync(require.resolve('../app/store-admin-access.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const sandbox = {
    exports: {},
    process: { env: centralOrigin ? { NEXT_PUBLIC_ADMIN_ORIGIN: centralOrigin } : {} },
    localStorage: { getItem: key => key === 'ecommerce_token' && signedIn ? 'test-token' : null },
    require: name => {
      if (name === 'react') return {
        useState: initial => [initial, value => changes.push({ id: index++, value })],
        useEffect: callback => callback(),
      };
      if (name === 'react/jsx-runtime') return require(name);
      if (name === 'next/link') return { default: () => null };
      if (name === './storefront-context') return { useStorefront: () => ({ isTenantDomain: tenant, slug: 'shop-a' }) };
      throw new Error(`Unexpected import ${name}`);
    },
  };
  vm.runInNewContext(code, sandbox);
  sandbox.exports.default();
  return changes.map(change => change.value);
}

test('a merchant signed in on their subdomain returns to the panel on that same origin', () => {
  assert.deepEqual(access({ tenant: true, signedIn: true }), ['/admin/dashboard', 'Panel del comercio']);
});

test('a subdomain without a local session keeps the existing central-panel route', () => {
  assert.deepEqual(access({ tenant: true, signedIn: false, centralOrigin: 'https://admin.example.test/' }),
    ['https://admin.example.test/admin/dashboard', 'Panel del comercio']);
});

test('ordinary store links use the local panel only when a session exists', () => {
  assert.deepEqual(access({ tenant: false, signedIn: true }), ['/admin/dashboard', 'Ir al dashboard']);
  assert.deepEqual(access({ tenant: false, signedIn: false }), ['/login', 'Acceso para comercios']);
});
