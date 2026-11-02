const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { UniqueConstraintError } = require('sequelize');
const { CatalogService } = require('../dist/catalog/catalog.service');
const { Product } = require('../dist/database/models/product.model');

afterEach(() => mock.restoreAll());

const productInput = { sku: 'REPETIDO', name: 'Producto de prueba', price: 100 };
const conflict = error => error.getStatus?.() === 409 && /SKU.*comercio/i.test(error.message);

test('creating a product with a duplicate store SKU returns a clear conflict', async () => {
  const duplicate = new UniqueConstraintError({ fields: { uq_products_commerce_sku: 'store-REPETIDO' } });
  mock.method(Product, 'create', async () => { throw duplicate; });
  await assert.rejects(new CatalogService().createProduct('store-a', 'user-a', productInput), conflict);
});

test('editing a product with another product SKU returns a clear conflict', async () => {
  const duplicate = new UniqueConstraintError({ fields: { commerce_id: 'store-a', sku: 'REPETIDO' } });
  mock.method(Product, 'findOne', async ({ where }) => {
    assert.deepEqual(where, { id: 'product-a', commerceId: 'store-a' });
    return { price: 100, async update() { throw duplicate; } };
  });
  await assert.rejects(new CatalogService().updateProduct('store-a', 'product-a', { sku: 'REPETIDO' }), conflict);
});

test('a MySQL duplicate entry identifying the SKU index is translated', async () => {
  const parent = new Error("Duplicate entry 'store-a-REPETIDO' for key 'products.uq_products_commerce_sku'");
  mock.method(Product, 'create', async () => { throw new UniqueConstraintError({ parent }); });
  await assert.rejects(new CatalogService().createProduct('store-a', 'user-a', productInput), conflict);
});

test('unrelated uniqueness and database failures are not mislabeled as duplicate SKUs', async () => {
  for (const error of [new UniqueConstraintError({ fields: { another_index: 'value' } }), new Error('database unavailable')]) {
    const create = mock.method(Product, 'create', async () => { throw error; });
    await assert.rejects(new CatalogService().createProduct('store-a', 'user-a', productInput), actual => actual === error);
    create.mock.restore();
  }
});
