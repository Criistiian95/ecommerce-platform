const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { CatalogService } = require('../dist/catalog/catalog.service');
const { CatalogPublicController } = require('../dist/catalog/catalog-public.controller');
const { Product } = require('../dist/database/models/product.model');
const { Commerce } = require('../dist/database/models/commerce.model');
afterEach(() => mock.restoreAll());

function existingProduct() {
  const product = { id: 'product', commerceId: 'commerce', active: true, published: true, price: 100, imageUrl: null,
    imageData: Buffer.from('old-image'), imageMimeType: 'image/png',
    async update(values) { Object.assign(this, values); },
    get() { return { ...this }; } };
  mock.method(Product, 'findOne', async ({ where }) => {
    assert.equal(where.id, 'product');
    if (where.commerceId !== undefined) assert.equal(where.commerceId, 'commerce');
    else {
      assert.equal(where.active, true);
      assert.equal(where.published, true);
    }
    return product;
  });
  mock.method(Commerce, 'findOne', async ({ where }) => {
    assert.equal(where.id, 'commerce');
    assert.equal(where.active, true);
    return { id: 'commerce' };
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

test('private images from inactive or unpublished products cannot be read publicly', async () => {
  mock.method(Product, 'findOne', async ({ where }) => {
    assert.equal(where.active, true);
    assert.equal(where.published, true);
    return null;
  });
  await assert.rejects(new CatalogService().getProductImage('private-product'), /Imagen no encontrada/);
});

test('images of products from inactive commerces cannot be read publicly', async () => {
  mock.method(Product, 'findOne', async () => ({
    commerceId: 'inactive-commerce',
    imageData: Buffer.from('private'),
    imageMimeType: 'image/png',
  }));
  mock.method(Commerce, 'findOne', async ({ where }) => {
    assert.equal(where.active, true);
    return null;
  });
  await assert.rejects(new CatalogService().getProductImage('private-product'), /Imagen no encontrada/);
});
