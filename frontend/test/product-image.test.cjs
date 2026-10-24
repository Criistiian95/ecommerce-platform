const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const MB = 1024 * 1024;

function setup(Reader, options = {}) {
  const record = { decoded: 0, revoked: 0, encodes: [], draws: [], read: null };
  const canvas = {
    width: 0, height: 0,
    getContext: () => options.noCanvas ? null : {
      drawImage: (_image, _x, _y, w, h) => record.draws.push([w, h]),
    },
    toBlob(callback, type, quality) {
      record.encodes.push({ width: this.width, height: this.height, type, quality });
      callback(options.emptyBlob ? null : {
        size: options.sizeFor ? options.sizeFor(record.encodes.length) : 400000,
        type: options.outputType || type,
      });
    },
  };
  const sandbox = {
    exports: {},
    window: { setTimeout, clearTimeout },
    URL: { createObjectURL: () => 'blob:fixture', revokeObjectURL: () => record.revoked++ },
    Image: class {
      naturalWidth = options.width ?? 1200;
      naturalHeight = options.height ?? 800;
      set src(value) {
        if (!value) return;
        record.decoded++;
        if (options.badImage) this.onerror(); else this.onload();
      }
    },
    document: { createElement: () => canvas },
    FileReader: Reader || class {
      readAsDataURL(blob) {
        record.read = blob;
        this.result = `data:${blob.type};base64,aW1hZ2U=`;
        this.onload();
      }
    },
  };
  vm.runInNewContext(ts.transpileModule(
    fs.readFileSync(require.resolve('../app/admin/product-image.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText, sandbox);
  return { ...sandbox.exports, record, canvas };
}

test('photos above 25 MB fail before decoding or sending anything', async () => {
  const image = setup();
  await assert.rejects(image.fileToBase64({ size: 25 * MB + 1, type: 'image/jpeg' }), error => {
    assert.match(image.productSaveError(error), /supera los 25 MB/);
    return true;
  });
  assert.equal(image.record.decoded, 0);
});

test('the reported 8 MB phone photo is resized proportionally before base64 encoding', async () => {
  const image = setup(null, { width: 4000, height: 3000 });
  const result = await image.fileToBase64({ size: 8 * MB, type: 'image/jpeg' });
  assert.deepEqual(image.record.draws, [[1920, 1440]]);
  assert.ok(image.record.read.size <= 2 * MB);
  assert.equal(result.mimeType, 'image/jpeg');
  assert.equal(image.record.revoked, 1);
  assert.equal(image.canvas.width, 0);
});

test('exactly 25 MB is accepted and portrait photos keep their aspect ratio', async () => {
  const image = setup(null, { width: 3000, height: 4000 });
  await image.fileToBase64({ size: 25 * MB, type: 'image/jpeg' });
  assert.deepEqual(image.record.draws, [[1440, 1920]]);
});

test('a small file with large dimensions is still reduced to the display limit', async () => {
  const image = setup(null, { width: 6000, height: 2000 });
  await image.fileToBase64({ size: MB, type: 'image/jpeg' });
  assert.deepEqual(image.record.draws, [[1920, 640]]);
});

test('small accepted images are preserved without unnecessary recompression or upscaling', async () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
    const image = setup();
    const file = { size: 2 * MB, type };
    const result = await image.fileToBase64(file);
    assert.equal(image.record.read, file);
    assert.equal(image.record.encodes.length, 0);
    assert.equal(result.mimeType, type);
    assert.equal(image.record.revoked, 1);
  }
});

test('transparent formats use WebP and honor the actual PNG fallback MIME type', async () => {
  for (const outputType of ['image/webp', 'image/png']) {
    const image = setup(null, { outputType });
    const result = await image.fileToBase64({ size: 8 * MB, type: 'image/png' });
    assert.equal(image.record.encodes[0].type, 'image/webp');
    assert.equal(result.mimeType, outputType);
  }
});

test('compression lowers quality then dimensions until the stored photo is within 2 MB', async () => {
  const image = setup(null, { width: 4000, height: 3000, sizeFor: n => n < 4 ? 3 * MB : MB });
  await image.fileToBase64({ size: 8 * MB, type: 'image/jpeg' });
  assert.deepEqual(image.record.encodes.map(e => e.quality), [0.86, 0.72, 0.55, 0.86]);
  assert.deepEqual(image.record.draws, [[1920, 1440], [1536, 1152]]);
  assert.equal(image.record.read.size, MB);
});

test('PNG fallback reduces dimensions instead of retrying ignored quality settings', async () => {
  const image = setup(null, { outputType: 'image/png', sizeFor: n => n === 1 ? 3 * MB : MB });
  await image.fileToBase64({ size: 8 * MB, type: 'image/png' });
  assert.equal(image.record.encodes.length, 2);
  assert.equal(image.record.encodes[1].width, 960);
});

test('an image that cannot fit is never base64 encoded or allowed past the storage limit', async () => {
  const image = setup(null, { sizeFor: () => 3 * MB });
  await assert.rejects(image.fileToBase64({ size: 8 * MB, type: 'image/jpeg' }), /reducir esta imagen/);
  assert.equal(image.record.read, null);
  assert.equal(image.record.revoked, 1);
  assert.equal(image.canvas.width, 0);
});

for (const options of [{ badImage: true }, { noCanvas: true }, { emptyBlob: true }, { width: 0 }]) {
  test(`invalid or unsupported image decoding/encoding fails clearly: ${JSON.stringify(options)}`, async () => {
    const image = setup(null, options);
    await assert.rejects(image.fileToBase64({ size: 8 * MB, type: 'image/jpeg' }), error => {
      assert.doesNotMatch(image.productSaveError(error), /conexión|servidor/);
      return true;
    });
    assert.equal(image.record.read, null);
    assert.equal(image.record.revoked, 1);
  });
}

test('unsupported HEIC format is rejected before decoding', async () => {
  const image = setup();
  await assert.rejects(image.fileToBase64({ size: 100, type: 'image/heic' }), /JPG, PNG o WebP/);
  assert.equal(image.record.decoded, 0);
});

for (const event of ['error', 'abort', 'throw', 'empty']) {
  test(`image reader ${event} reports an image problem`, async () => {
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

test('uncertain network failures still require checking the list before another write', () => {
  assert.match(setup().productSaveError(new TypeError('Failed to fetch')), /actualizá la lista antes/);
});
