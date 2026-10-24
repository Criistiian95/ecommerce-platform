const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function compile(path, sandbox) {
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve(path), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, sandbox);
  return sandbox.exports;
}

function setup(fetch, imageFile = null) {
  let index = 0;
  let resets = 0;
  const updates = [];
  class File { constructor(size, type) { this.size = size; this.type = type; } }
  const image = compile('../app/admin/product-image.ts', { exports: {}, FileReader: class {
    constructor() { assert.fail('These tests must not read an accepted image'); }
  } });
  const react = {
    useState: initial => {
      const id = index++;
      return [id === 0 ? 'admin-token' : initial, value => updates.push({ id, value })];
    },
    useEffect: () => {}, useMemo: fn => fn(), useRef: () => ({ current: null }),
  };
  const Page = compile('../app/admin/page.tsx', {
    exports: {}, process: { env: { NEXT_PUBLIC_API_URL: 'https://api.example.org' } },
    require: name => {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return require(name);
      if (name === './navigation') return { default: () => null };
      if (name === './product-image') return image;
      throw new Error(`Unexpected import ${name}`);
    },
    fetch, File, FormData: class { get(key) {
      if (key === 'imageFile') return imageFile ? new File(imageFile.size, imageFile.type) : null;
      return ({ name: 'Product fixture', sku: 'TEST-SKU', price: '1000' })[key] ?? null;
    } },
    window: { setTimeout: () => {} },
  }).default;
  function find(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'form' && node.props.onSubmit?.name === 'createProduct') return node;
    for (const child of [node.props?.children].flat(Infinity)) {
      const match = find(child);
      if (match) return match;
    }
  }
  const form = find(Page());
  assert.ok(form);
  return {
    submit: () => form.props.onSubmit({ preventDefault() {}, currentTarget: { reset() { resets++; } } }),
    get resets() { return resets; },
    get toast() { return updates.filter(update => update.id === 3).at(-1)?.value; },
  };
}

test('creating with an oversized photo preserves the form, shows the cause and sends no request', async () => {
  const form = setup(() => { assert.fail('No request for an invalid photo'); }, { size: 3 * 1024 * 1024, type: 'image/jpeg' });
  await form.submit();
  assert.equal(form.resets, 0);
  assert.match(form.toast.text, /supera los 2 MB/);
  assert.equal(form.toast.type, 'error');
});

test('successful creation followed by failed list refresh still confirms the save without retrying it', async () => {
  const writes = [];
  const form = setup(async (url, options) => {
    if (options.method === 'POST') { writes.push(url); return { ok: true }; }
    throw new TypeError('Connection lost after the save');
  });
  await form.submit();
  assert.equal(writes.length, 1);
  assert.equal(form.resets, 1);
  assert.match(form.toast.text, /Producto creado correctamente/);
  assert.match(form.toast.text, /Actualizar lista/);
  assert.match(form.toast.text, /No repitas la carga/);
});

test('uncertain write keeps the entered product and does not automatically retry', async () => {
  let requests = 0;
  const form = setup(async () => { requests++; throw new TypeError('Failed to fetch'); });
  await form.submit();
  assert.equal(requests, 1);
  assert.equal(form.resets, 0);
  assert.match(form.toast.text, /No pudimos confirmar el guardado/);
});

test('expired session gets a specific message without discarding the product form', async () => {
  const form = setup(async () => ({ ok: false, status: 401 }));
  await form.submit();
  assert.equal(form.resets, 0);
  assert.match(form.toast.text, /Tu sesión venció/);
});
