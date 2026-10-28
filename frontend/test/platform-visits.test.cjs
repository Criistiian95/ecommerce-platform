const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../app/platform-visit-path.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const sandbox = { exports: {} }; vm.runInNewContext(code, sandbox);
const { isPlatformVisit } = sandbox.exports;

test('counts only public platform pages on the platform domain', () => {
  for (const path of ['/', '/registro', '/contacto', '/demo', '/login'])
    assert.equal(isPlatformVisit('disenolys.store', path, false, 'disenolys.store'), true, path);
  for (const path of ['/estadisticas', '/admin', '/tienda', '/tienda/demo', '/producto/123', '/carrito'])
    assert.equal(isPlatformVisit('disenolys.store', path, false, 'disenolys.store'), false, path);
  assert.equal(isPlatformVisit('mimarca.disenolys.store', '/', true, 'disenolys.store'), false);
  assert.equal(isPlatformVisit('other.example', '/', false, 'disenolys.store'), false);
  assert.equal(isPlatformVisit('www.disenolys.store', '/registro', false, 'disenolys.store'), true);
});
