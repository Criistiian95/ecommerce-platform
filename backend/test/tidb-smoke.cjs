'use strict';

// This program writes only fictional test data to one previously prepared schema.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { randomUUID } = require('node:crypto');

const expectedHost = 'gateway01.us-west-2.prod.aws.tidbcloud.com';
const expectedSchema = '/disenolys_runner_test';
const expectedGuard = '49b49aa9-aa74-44b5-9326-e8869c5d3001';

function validateDestination(value) {
  let destination;
  try { destination = new URL(value); }
  catch { throw new Error('La dirección de prueba no tiene un formato válido.'); }
  if (destination.protocol !== 'mysql:' || destination.hostname !== expectedHost ||
      destination.port !== '4000' || destination.pathname !== expectedSchema ||
      !destination.username || !destination.password || destination.search || destination.hash) {
    throw new Error('La conexión no corresponde a la base aislada de prueba.');
  }
  return value;
}

async function main() {
  process.env.DATABASE_URL = validateDestination(process.env.TIDB_TEST_DATABASE_URL || '');
  process.env.DATABASE_SSL = 'true';
  process.env.BOOTSTRAP_DEMO = 'false';
  process.env.JWT_SECRET = 'isolated-integration-test-only';

  const fromBackend = createRequire(path.join(process.cwd(), 'package.json'));
  const { QueryTypes } = fromBackend('sequelize');
  const bcrypt = fromBackend('bcryptjs');
  const { DatabaseService } = fromBackend('./dist/database/database.service');
  const { runMigrations } = fromBackend('./dist/database/migrations/runner');
  const { Commerce } = fromBackend('./dist/database/models/commerce.model');
  const { Product } = fromBackend('./dist/database/models/product.model');
  const { User } = fromBackend('./dist/database/models/user.model');
  const { AuthService } = fromBackend('./dist/auth/auth.service');
  const { AuthGuard } = fromBackend('./dist/auth/auth.guard');
  const { CatalogService } = fromBackend('./dist/catalog/catalog.service');
  const { AdminCommerceSettingsService } = fromBackend('./dist/catalog/admin-commerce-settings.service');
  const db = new DatabaseService();
  let stage = 'conexión TLS';
  try {
    await db.sequelize.authenticate();
    const connection = await db.sequelize.connectionManager.getConnection({ type: 'WRITE' });
    try {
      assert.equal(connection.stream.encrypted, true, 'TLS no está activo');
      assert.equal(connection.stream.authorized, true, 'El certificado no fue verificado');
    } finally { await db.sequelize.connectionManager.releaseConnection(connection); }

    stage = 'identificación del entorno aislado';
    const guards = await db.sequelize.query('SELECT id FROM `_ci_guard` WHERE id = ?', {
      replacements: [expectedGuard], type: QueryTypes.SELECT,
    });
    assert.equal(guards.length, 1, 'La base no es el entorno de prueba esperado');

    stage = 'migraciones de la aplicación';
    await runMigrations(db.sequelize);
    await db.onModuleInit();
    const versions = await db.sequelize.query('SELECT version FROM schema_migrations', { type: QueryTypes.SELECT });
    assert.equal(versions.length, 19, 'No se aplicaron todas las migraciones');

    stage = 'comercios ficticios';
    const suffix = randomUUID();
    const storeA = await Commerce.create({ name: 'Tienda de prueba A', slug: `ci-a-${suffix}`, active: true });
    const storeB = await Commerce.create({ name: 'Tienda de prueba B', slug: `ci-b-${suffix}`, active: true });
    const password = 'isolated-test-only';
    const hash = await bcrypt.hash(password, 4);
    const adminA = await User.create({ commerceId: storeA.id, email: `ci-a-${suffix}@example.com`, name: 'Prueba A', passwordHash: hash, role: 'admin' });
    const adminB = await User.create({ commerceId: storeB.id, email: `ci-b-${suffix}@example.com`, name: 'Prueba B', passwordHash: hash, role: 'admin' });
    const productA = await Product.create({ commerceId: storeA.id, sku: 'SKU-DE-PRUEBA', name: 'Producto A', price: 100, currentStock: 10 });
    const productB = await Product.create({ commerceId: storeB.id, sku: 'SKU-DE-PRUEBA', name: 'Producto B', price: 100, currentStock: 10 });

    stage = 'sesiones y aislamiento';
    const auth = new AuthService(db, {});
    const guard = new AuthGuard(auth);
    const catalog = new CatalogService();
    const loginA = await auth.login(adminA.email, password, storeA.slug);
    const loginB = await auth.login(adminB.email, password, storeB.slug);
    async function requestFor(token) {
      const request = { headers: { authorization: `Bearer ${token}` }, method: 'GET', path: '/admin' };
      assert.equal(await guard.canActivate({ switchToHttp: () => ({ getRequest: () => request }) }), true);
      return request;
    }
    const requestA = await requestFor(loginA.token);
    const requestB = await requestFor(loginB.token);
    assert.equal(requestA.auth.commerceId, storeA.id);
    assert.equal(requestB.auth.commerceId, storeB.id);
    await assert.rejects(catalog.updateProduct(storeA.id, productB.id, { name: 'No autorizado' }));

    stage = 'edición de imágenes y personalización';
    const firstImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
    const replacementImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    for (const image of [firstImage, replacementImage]) {
      await catalog.updateProduct(storeA.id, productA.id, { imageDataBase64: image.toString('base64'), imageMimeType: 'image/png' });
      assert.deepEqual((await catalog.getProductImage(productA.id)).data, image);
    }
    const settings = new AdminCommerceSettingsService();
    await settings.updateSettings(storeA.id, { primaryColor: '#123456', heroTitle: 'Tienda A' });
    assert.equal((await settings.getSettings(storeA.id)).primaryColor, '#123456');
    assert.notEqual((await settings.getSettings(storeB.id)).primaryColor, '#123456');
    assert.equal((await requestFor(loginA.token)).auth.commerceId, storeA.id);
    await auth.logout(requestA.auth.sessionId);
    await assert.rejects(requestFor(loginA.token));
    assert.equal((await requestFor(loginB.token)).auth.commerceId, storeB.id);

    console.log('Conexión TLS, migraciones, dos comercios ficticios, sesiones, imágenes y personalización: aprobadas.');
  } catch (error) {
    // Never print database URLs, credentials, SQL text or other sensitive data.
    const candidate = error?.original?.code || error?.parent?.code || error?.code;
    const safeCode = typeof candidate === 'string' && /^[A-Z0-9_]+$/.test(candidate) ? candidate : 'SIN_CODIGO';
    console.error(`Falló la etapa: ${stage} (${safeCode}).`);
    process.exitCode = 1;
  } finally { await db.onModuleDestroy(); }
}

if (require.main === module) main().catch(() => { console.error('No se pudo iniciar la prueba aislada.'); process.exitCode = 1; });
module.exports = { validateDestination };
