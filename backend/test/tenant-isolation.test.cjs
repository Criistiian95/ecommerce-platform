const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { AdminOrdersService } = require('../dist/catalog/admin-orders.service');
const { AdminCustomersService } = require('../dist/catalog/admin-customers.service');
const { AdminCommerceSettingsService } = require('../dist/catalog/admin-commerce-settings.service');
const { CatalogService } = require('../dist/catalog/catalog.service');
const { PublicCartService } = require('../dist/catalog/public-cart.service');
const { Order } = require('../dist/database/models/order.model');
const { User } = require('../dist/database/models/user.model');
const { Commerce } = require('../dist/database/models/commerce.model');
const { Product } = require('../dist/database/models/product.model');

afterEach(() => mock.restoreAll());

test('order details from commerce B are invisible to admin A', async () => {
  mock.method(Order, 'findOne', async ({ where }) => {
    assert.deepEqual(where, { id: 'order-b', commerceId: 'commerce-a' });
    return null; // Order belongs to commerce B, excluded by the query.
  });
  await assert.rejects(new AdminOrdersService().detail('commerce-a', 'order-b'), /Pedido no encontrado/);
});

test('registered customers from commerce B are invisible to admin A', async () => {
  mock.method(User, 'findOne', async ({ where }) => {
    assert.equal(where.id, 'customer-b');
    assert.equal(where.commerceId, 'commerce-a');
    return null;
  });
  await assert.rejects(new AdminCustomersService().detail('commerce-a', 'customer:customer-b'), /Cliente no encontrado/);
});

test('admin A cannot edit a product belonging to commerce B', async () => {
  mock.method(Product, 'findOne', async ({ where }) => {
    assert.deepEqual(where, { id: 'product-b', commerceId: 'commerce-a' });
    return null;
  });
  await assert.rejects(new CatalogService().updateProduct('commerce-a', 'product-b', { name: 'Changed' }), /Producto no encontrado/);
});

test('admin settings always use authenticated commerce id', async () => {
  mock.method(Commerce, 'findByPk', async id => {
    assert.equal(id, 'commerce-a');
    return null;
  });
  await assert.rejects(new AdminCommerceSettingsService().updateSettings('commerce-a', { name: 'Other store' }), /Comercio no encontrado/);
});

test('cart validation rejects foreign commerce product ids', async () => {
  mock.method(Commerce, 'findOne', async ({ where }) => {
    assert.equal(where.slug, 'store-a');
    return { id: 'commerce-a' };
  });
  mock.method(Product, 'findAll', async ({ where }) => {
    assert.equal(where.commerceId, 'commerce-a');
    assert.equal(where.active, true);
    assert.equal(where.published, true);
    return []; // product-b belongs to commerce B
  });
  const result = await new PublicCartService().validateCart('store-a', [{ productId: 'product-b', quantity: 1 }]);
  assert.equal(result.valid, false);
  assert.equal(result.items[0].available, false);
});
