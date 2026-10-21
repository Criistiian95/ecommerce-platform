'use strict';

// Read-only preflight. This script never starts Nest, connects to MySQL or creates payments.
const PRODUCTION_HOSTS = new Set([
  'ecommerce-platform-web.onrender.com',
  'ecommerce-platform-api-2kh1.onrender.com',
]);

class PreflightError extends Error {}
function requireCondition(condition, message) {
  if (!condition) throw new PreflightError(message);
}
function required(env, name) {
  const value = typeof env[name] === 'string' ? env[name].trim() : '';
  requireCondition(value, `Falta ${name}.`);
  return value;
}
function parseUrl(value, name) {
  try { return new URL(value); }
  catch { throw new PreflightError(`${name} no es una URL válida.`); }
}
function testHttpsUrl(value, name) {
  const url = parseUrl(value, name);
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  requireCondition(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash,
    `${name} debe usar HTTPS, sin credenciales, parámetros ni fragmentos.`);
  requireCondition(!PRODUCTION_HOSTS.has(host) && host !== 'disenolys.store' && !host.endsWith('.disenolys.store'),
    `${name} apunta a un dominio de producción.`);
  return url;
}

function validateConfig(env) {
  requireCondition(env.BILLING_TEST_ENVIRONMENT === 'isolated', 'Falta declarar BILLING_TEST_ENVIRONMENT=isolated.');
  requireCondition(env.BILLING_RECONCILIATION_ENABLED === 'false', 'La conciliación debe seguir desactivada en esta primera prueba.');
  requireCondition(env.BOOTSTRAP_DEMO === 'false', 'BOOTSTRAP_DEMO debe ser false en el entorno de prueba.');
  requireCondition(['false', 'true'].includes(env.BILLING_ENABLED), 'Definí BILLING_ENABLED explícitamente.');
  const database = parseUrl(required(env, 'DATABASE_URL'), 'DATABASE_URL');
  requireCondition(database.protocol === 'mysql:' && database.pathname === '/disenolys_billing_test',
    'La base de prueba debe ser MySQL y llamarse disenolys_billing_test.');
  const frontend = testHttpsUrl(required(env, 'FRONTEND_URL'), 'FRONTEND_URL');
  requireCondition(frontend.pathname === '/', 'FRONTEND_URL debe ser el origen del frontend de prueba.');
  const webhook = testHttpsUrl(required(env, 'BILLING_WEBHOOK_URL'), 'BILLING_WEBHOOK_URL');
  requireCondition(webhook.pathname === '/billing/webhook', 'BILLING_WEBHOOK_URL debe terminar en /billing/webhook.');
  const sellerId = required(env, 'BILLING_TEST_SELLER_ID');
  const buyerId = required(env, 'BILLING_TEST_BUYER_ID');
  requireCondition(/^[1-9]\d{0,19}$/.test(sellerId) && /^[1-9]\d{0,19}$/.test(buyerId) && sellerId !== buyerId,
    'Ingresá IDs distintos y válidos para vendedor y comprador de prueba.');
  const buyerEmail = required(env, 'BILLING_TEST_BUYER_EMAIL').toLowerCase();
  requireCondition(/^[^\s@]+@testuser\.com$/.test(buyerEmail), 'Usá el email @testuser.com del comprador creado por Mercado Pago.');
  const token = required(env, 'MP_SUBSCRIPTIONS_ACCESS_TOKEN');
  required(env, 'MP_SUBSCRIPTIONS_WEBHOOK_SECRET');
  return { sellerId, buyerId, buyerEmail, token };
}

async function checkBillingTestEnvironment(env, fetchImpl = globalThis.fetch) {
  // Validate locally before sending any credential to the provider.
  const config = validateConfig(env);
  let response;
  try {
    response = await fetchImpl('https://api.mercadopago.com/users/me', {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${config.token}`, Accept: 'application/json' },
    });
  } catch {
    throw new PreflightError('No se pudo consultar la cuenta en Mercado Pago. Revisá conectividad y acceso.');
  }
  requireCondition(response.ok, `Mercado Pago rechazó la consulta de cuenta (HTTP ${response.status}).`);
  let account;
  try { account = await response.json(); }
  catch { throw new PreflightError('Mercado Pago devolvió una respuesta que no es JSON válido.'); }
  requireCondition(account && String(account.id) === config.sellerId, 'El token no pertenece al vendedor de prueba esperado.');
  requireCondition(account.site_id === 'MLA', 'El vendedor debe pertenecer a Argentina (MLA).');
  requireCondition(Array.isArray(account.tags) && account.tags.includes('test_user'),
    'La respuesta no identifica al vendedor como test_user. Revisá la cuenta; no continúes con el checkout.');
  requireCondition(String(account.email || '').toLowerCase() !== config.buyerEmail,
    'El comprador y el vendedor deben ser cuentas distintas.');
  // Do not return tokens, emails, provider bodies or database connection strings.
  return { configChecked: true, sellerTestAccountVerified: true, endToEndVerified: false };
}

if (require.main === module) {
  checkBillingTestEnvironment(process.env).then(() => {
    console.log('Configuración revisada y vendedor de prueba verificado.');
    console.log('Pendiente: validar comprador en Developers, aislamiento real de la BD, checkout, firma, pago y activación.');
    console.log('No se crearon suscripciones ni pagos. Esto no habilita producción.');
  }).catch(error => {
    console.error(error instanceof PreflightError ? error.message : 'Falló la comprobación previa. No continúes con el checkout.');
    process.exitCode = 1;
  });
}

module.exports = { checkBillingTestEnvironment };
