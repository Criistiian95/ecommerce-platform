const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const compiled = ts.transpileModule(fs.readFileSync(require.resolve('../app/storefront-routing.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const sandbox = { exports: {} };
vm.runInNewContext(compiled, sandbox);
const { storePath, customerDestination, storeStorageKey } = sandbox.exports;
test('all purchase and customer routes stay in the selected store', () => {
  for (const slug of ['almacen-a', 'ropa-b']) {
    for (const page of ['/producto/id', '/carrito', '/checkout', '/cliente/login?next=/checkout', '/cliente/registro', '/mi-cuenta', '/pago/resultado?order=1']) {
      assert.equal(storePath(slug, page), `/tienda/${slug}${page}`);
    }
    assert.equal(storePath(slug, '/tienda'), `/tienda/${slug}`);
    assert.equal(storePath(slug, '/admin'), '/admin');
    assert.equal(storePath(slug, `/tienda/${slug}/carrito`), `/tienda/${slug}/carrito`);
  }
  assert.equal(storePath(undefined, '/carrito'), '/carrito');
});
test('customer next parameter cannot redirect outside the store or to admin', () => {
  for (const next of ['//evil.example', '/\\evil.example', 'https://evil.example', '/tienda/otra', '/admin', null]) {
    assert.equal(storePath('a', customerDestination(next)), '/tienda/a/mi-cuenta');
  }
  assert.equal(storePath('a', customerDestination('/checkout')), '/tienda/a/checkout');
});
test('cart and customer sessions have distinct storage keys per commerce', () => {
  for (const kind of ['ecommerce_cart_v2', 'ecommerce_customer_token']) {
    assert.notEqual(storeStorageKey(kind, 'a'), storeStorageKey(kind, 'b'));
  }
});
