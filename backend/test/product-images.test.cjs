const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { CatalogService } = require('../dist/catalog/catalog.service');
const { CatalogPublicController } = require('../dist/catalog/catalog-public.controller');
const { Product } = require('../dist/database/models/product.model');
afterEach(() => mock.restoreAll());

function existingProduct() {
  const product = { id: 'product', price: 100, imageUrl: null,
    imageData: Buffer.from('old-image'), imageMimeType: 'image/png',
    async update(values) { Object.assign(this, values); },
    get() { return { ...this }; } };
  mock.method(Product, 'findOne', async ({ where }) => {
    assert.equal(where.commerceId, 'commerce');
    assert.equal(where.id, 'product');
    return product;
  });
  return product;
}

test('replacing an uploaded image serves the new bytes and requires cache revalidation', async () => {
  const product = existingProduct();
  const service = new CatalogService();
  await service.updateProduct('commerce', 'product', {
    imageDataBase64: Buffer.from('new-image').toString('base64'), imageMimeType: 'image/webp',
    clearUploadedImage: true,
  });
  mock.method(Product, 'findByPk', async () => product);
  const response = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, send(data) { this.body = data; } };
  await new CatalogPublicController(service).productImage('product', response);
  assert.equal(response.body.toString(), 'new-image');
  assert.equal(response.headers['Content-Type'], 'image/webp');
  assert.equal(response.headers['Cache-Control'], 'public, no-cache');
});

test('a new URL replaces the old uploaded image without requiring a client-only flag', async () => {
  const product = existingProduct();
  const result = await new CatalogService().updateProduct('commerce', 'product', { imageUrl: 'https://example.com/new.png' });
  assert.equal(product.imageData, null);
  assert.equal(product.imageMimeType, null);
  assert.equal(result.imageUrl, 'https://example.com/new.png');
  assert.equal(result.hasUploadedImage, false);
});

test('editing other fields preserves an existing upload', async () => {
  const product = existingProduct();
  await new CatalogService().updateProduct('commerce', 'product', { name: 'Updated', imageUrl: null, imageDataBase64: null });
  assert.equal(product.imageData.toString(), 'old-image');
});
