const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function compile(path, sandbox) {
  const code = ts.transpileModule(fs.readFileSync(require.resolve(path), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, sandbox);
  return sandbox.exports;
}

function storefront({ host, paramSlug, serverSlug, server = false }) {
  const tenant = compile('../app/tenant-host.ts', { exports: {}, process: { env: {} } });
  const routing = compile('../app/storefront-routing.ts', { exports: {} });
  const sandbox = {
    exports: {},
    ...(host ? { window: { location: { host } } } : {}),
    require: name => {
      if (name === 'react') return {
        createContext: () => ({ Provider: 'provider' }),
        useMemo: fn => fn(),
        useSyncExternalStore: (_subscribe, client, onServer) => server ? onServer() : client(),
      };
      if (name === 'react/jsx-runtime') return require(name);
      if (name === 'next/navigation') return { useParams: () => ({ slug: paramSlug }) };
      if (name === './tenant-host') return tenant;
      if (name === './storefront-routing') return routing;
      if (name === './storefront-config') return { COMMERCE_SLUG: 'default-store' };
      if (name === './cart-context') return { CartProvider: 'cart' };
      if (name === './customer-auth-context') return { CustomerAuthProvider: 'customer' };
      if (name === './commerce-theme-provider') return { CommerceThemeProvider: 'theme' };
      throw new Error(`Unexpected import ${name}`);
    },
  };
  const { StorefrontProvider } = compile('../app/storefront-context.tsx', sandbox);
  return StorefrontProvider({ children: null, domainSlug: serverSlug }).props.value;
}

test('a rewritten tenant storefront recovers its real browser hostname', () => {
  const store = storefront({ host: 'alpha.disenolys.store', paramSlug: 'alpha', serverSlug: null });
  assert.equal(store.slug, 'alpha');
  assert.equal(store.isTenantDomain, true);
  assert.equal(store.path('/carrito'), '/carrito');
});

test('a store on the main domain retains its scoped URLs', () => {
  const store = storefront({ host: 'disenolys.store', paramSlug: 'alpha', serverSlug: null });
  assert.equal(store.slug, 'alpha');
  assert.equal(store.isTenantDomain, false);
  assert.equal(store.path('/carrito'), '/tienda/alpha/carrito');
});

test('server rendering uses its supplied domain without accessing window', () => {
  const store = storefront({ paramSlug: undefined, serverSlug: 'alpha', server: true });
  assert.equal(store.slug, 'alpha');
  assert.equal(store.isTenantDomain, true);
});
