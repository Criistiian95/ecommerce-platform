const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
function load(file, requireModule) {
  const sandbox = { exports: {}, process: { env: {} }, require: requireModule };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve(file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, sandbox);
  return sandbox.exports;
}
const tenant = load('../app/tenant-host.ts');
const { resolveStaticRoute: resolve } = load('../static/routes.ts', () => tenant);
const root = 'disenolys.store';

test('static links resolve newly created stores and products without rebuilding', () => {
  const route = resolve(root, '/tienda/nuevo-comercio/producto/new-product');
  assert.equal(route.page, 'product');
  assert.equal(route.params.slug, 'nuevo-comercio');
  assert.equal(route.params.id, 'new-product');
  assert.equal(route.storefront, true);
  assert.equal(resolve(root, '/tienda/nuevo-comercio/').page, 'store');
});
test('customer and payment links preserve their tenant on reload', () => {
  const routes = {
    '/carrito': 'cart', '/checkout': 'checkout', '/cliente/login': 'customerLogin',
    '/cliente/registro': 'customerRegistration', '/cliente/recuperar': 'customerRecovery',
    '/mi-cuenta': 'account', '/pago/resultado': 'payment',
  };
  for (const [path, page] of Object.entries(routes)) {
    for (const slug of ['cfz-carpinteria', 'otra-tienda']) {
      const subpath = resolve(root, `/tienda/${slug}${path}`, '?order=123');
      const subdomain = resolve(`${slug}.${root}`, path, '?order=123');
      assert.equal(subpath.page, page);
      assert.equal(subpath.params.slug, slug);
      assert.equal(subdomain.page, page);
      assert.equal(subdomain.domainSlug, slug);
      assert.equal(subdomain.params.slug, undefined);
    }
  }
});
test('tenant subdomains cannot show another shop or the default demo', () => {
  const host = `cfz-carpinteria.${root}`;
  assert.equal(resolve(host, '/').page, 'store');
  assert.equal(resolve(host, '/tienda/otra-tienda/checkout').redirect, '/');
  assert.equal(resolve(host, '/tienda/cfz-carpinteria/checkout', '?next=1').redirect, '/checkout?next=1');
  assert.equal(resolve(host, '/demo').redirect, `https://${root}/demo`);
  assert.equal(resolve(host, '/contacto').page, undefined);
  assert.equal(resolve(host, '/admin/personalizar').page, 'design');
});
test('reserved and malformed subdomains never fall back to demo', () => {
  for (const host of [`api.${root}`, `admin.${root}`, `foo.bar.${root}`, `foo..${root}`]) {
    assert.equal(resolve(host, '/').page, undefined);
    assert.equal(resolve(host, '/tienda').page, undefined);
  }
  assert.equal(resolve(`www.${root}`, '/demo', '?source=test').redirect, `https://${root}/demo?source=test`);
});
test('invalid routes and encoded path injection cannot request a different product', () => {
  for (const path of ['/tienda/bad%2fslug', '/producto/%2Fadmin', '/producto/%3Ftest', '/producto/%', '/tienda/cfz/contacto', '/tienda/cfz/admin', '/admin/unknown']) {
    assert.equal(resolve(root, path).page, undefined, path);
  }
});
test('root marketing, registration, admin and demo remain available on a preview domain', () => {
  for (const [path, page] of Object.entries({ '/': 'home', '/contacto': 'contact', '/registro': 'registration', '/login': 'login', '/setup': 'setup', '/recuperar': 'recovery', '/admin': 'admin', '/admin/dashboard': 'dashboard', '/admin/personalizar': 'design', '/admin/configuracion': 'settings', '/admin/clientes': 'customers', '/admin/pedidos': 'orders', '/tienda': 'store', '/demo': 'demo' })) {
    assert.equal(resolve('preview.onrender.com', path).page, page, path);
  }
});
