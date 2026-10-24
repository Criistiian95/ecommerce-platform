const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function setup(FileReader) {
  const sandbox = { exports: {}, FileReader };
  vm.runInNewContext(ts.transpileModule(
    fs.readFileSync(require.resolve('../app/admin/product-image.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText, sandbox);
  return sandbox.exports;
}

test('oversized phone photos report the size limit, not a server connection failure', async () => {
  const image = setup(class { constructor() { assert.fail('Must reject before reading a large image'); } });
  await assert.rejects(image.fileToBase64({ size: 2 * 1024 * 1024 + 1, type: 'image/jpeg' }), error => {
    assert.match(image.productSaveError(error), /supera los 2 MB/);
    assert.doesNotMatch(image.productSaveError(error), /conexión|servidor/);
    return true;
  });
});

test('unsupported formats show the allowed image types before reading', async () => {
  const image = setup(class { constructor() { assert.fail('Must reject before reading'); } });
  await assert.rejects(image.fileToBase64({ size: 100, type: 'image/heic' }), error => {
    assert.match(image.productSaveError(error), /JPG, PNG o WebP/);
    return true;
  });
});

test('all supported formats at the 2 MB boundary preserve image data and MIME type', async () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
    const image = setup(class {
      readAsDataURL(file) {
        this.result = `data:${file.type};base64,aW1hZ2U=`;
        this.onload();
      }
    });
    const result = await image.fileToBase64({ size: 2 * 1024 * 1024, type });
    assert.equal(result.data, 'aW1hZ2U=');
    assert.equal(result.mimeType, type);
  }
});

for (const event of ['error', 'abort', 'throw', 'empty']) {
  test(`image reader ${event} reports an image problem and settles the promise`, async () => {
    const image = setup(class {
      readAsDataURL() {
        if (event === 'throw') throw new Error('File no longer accessible');
        if (event === 'empty') { this.result = 'data:image/jpeg;base64,'; this.onload(); }
        else this[`on${event}`]();
      }
    });
    await assert.rejects(image.fileToBase64({ size: 50, type: 'image/jpeg' }), error => {
      assert.match(image.productSaveError(error), /imagen/);
      assert.doesNotMatch(image.productSaveError(error), /conexión|servidor/);
      return true;
    });
  });
}

test('an uncertain network failure asks to check the list before another write', () => {
  const image = setup();
  const message = image.productSaveError(new TypeError('Failed to fetch'));
  assert.match(message, /No pudimos confirmar el guardado/);
  assert.match(message, /actualizá la lista antes/);
});
