const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const code = ts.transpileModule(fs.readFileSync(require.resolve('../app/store-visit-path.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const sandbox = { exports: {} }; vm.runInNewContext(code, sandbox);
const { isStoreVisitPath } = sandbox.exports;

test('only storefront and shopping routes count, never marketing or the admin panel', () => {
  for (const path of ['/tienda/my-shop', '/tienda/my-shop/producto/123', '/tienda/my-shop/carrito', '/tienda/my-shop/checkout', '/tienda'])
    assert.equal(isStoreVisitPath(path, 'my-shop', false), true, path);
  for (const path of ['/', '/demo', '/registro', '/admin', '/admin/dashboard', '/tienda/other'])
    assert.equal(isStoreVisitPath(path, 'my-shop', false), false, path);
  for (const path of ['/', '/producto/id', '/carrito', '/checkout']) assert.equal(isStoreVisitPath(path, 'my-shop', true), true, path);
  for (const path of ['/admin', '/admin/personalizar', '/registro', '/demo']) assert.equal(isStoreVisitPath(path, 'my-shop', true), false, path);
});
