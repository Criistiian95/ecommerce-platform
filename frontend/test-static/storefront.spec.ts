import { test, expect, type BrowserContext } from '@playwright/test';

// Browser-only fixtures. Nothing here creates accounts, changes live stock or charges money.
const api = 'https://ecommerce-platform-api-2kh1.onrender.com';
const slug = 'cfz-carpinteria';
const shop = `/tienda/${slug}`;
const product = { id: 'sample-1', name: 'Producto de prueba', description: 'Artículo para verificar la navegación.', price: '20000', featured: true, available: true, imageUrl: '/covers/oak.webp' };
const initialCommerce = {
  slug, name: 'CFZ Carpintería', tagline: 'Diseño de muebles de interior y exterior.',
  heroTitle: 'Tu idea, hecha en madera.', primaryColor: '#987042', secondaryColor: '#332b22',
  backgroundColor: '#faf5eb', coverPreset: 'oak', coverUrl: '/covers/oak.webp', fontFamily: 'classic',
  accountDisplay: 'icon', pickupEnabled: true, shippingEnabled: true,
};

async function mockApi(context: BrowserContext) {
  let commerce: Record<string, unknown> = { ...initialCommerce };
  const requests: { path: string; method: string; body: any }[] = [];
  await context.route(`${api}/**`, async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const body = request.postData() ? request.postDataJSON() : null;
    requests.push({ path, method: request.method(), body });
    if (path === '/admin/commerce/settings') {
      if (request.method() === 'PATCH') commerce = { ...commerce, ...body };
      await route.fulfill({ json: commerce }); return;
    }
    const catalog = /^\/catalog\/store\/([^/]+)$/.exec(path);
    if (catalog) {
      const requestedSlug = catalog[1];
      const data = requestedSlug === slug ? commerce : { ...initialCommerce, slug: requestedSlug, name: 'Otra tienda', heroTitle: 'Otra tienda' };
      await route.fulfill({ json: { commerce: data, categories: [], products: [product] } }); return;
    }
    if (path.endsWith('/products/sample-1')) { await route.fulfill({ json: product }); return; }
    if (path.endsWith('/cart/validate')) { await route.fulfill({ json: { valid: true } }); return; }
    if (path.endsWith('/checkout')) {
      await route.fulfill({ json: { order: { id: 'test-order' }, payment: { checkoutUrl: 'https://payment.example.test/checkout' } } }); return;
    }
    if (path.endsWith('/orders/test-order/status')) {
      await route.fulfill({ json: { id: 'test-order', orderNumber: 'TEST-001', paymentStatus: 'paid', total: 20000, deliveryMethod: 'pickup', emailStatus: 'sent' } }); return;
    }
    if (path === '/auth/customer/login') {
      await route.fulfill({ json: { token: 'test-customer-token', user: { id: 'test-user', commerceId: slug, name: 'Cliente prueba', email: 'test@example.test', role: 'customer' } } }); return;
    }
    await route.fulfill({ status: 404, json: { message: 'Fixture not configured' } });
  });
  return requests;
}

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', error => errors.push(error.message));
});
test.afterEach(() => { expect(errors).toEqual([]); });

test('store/product/cart deep links reload and retain the correct tenant', async ({ page, context }) => {
  const requests = await mockApi(context);
  await page.goto(shop);
  await expect(page.getByRole('heading', { name: initialCommerce.heroTitle })).toBeVisible();
  expect(requests.some(r => r.path.includes('comercio-demo'))).toBe(false);
  await page.getByRole('link', { name: product.name, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${shop}/producto/sample-1$`));
  await page.reload();
  await expect(page.getByRole('heading', { name: product.name })).toBeVisible();
  await page.getByRole('button', { name: /Agregar/ }).click();
  await expect(page.getByText('Agregado al carrito.', { exact: true })).toBeVisible();
  await page.goto(`${shop}/carrito`);
  await expect(page.getByText(product.name, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(product.name, { exact: true })).toBeVisible();
  await page.goto('/tienda/otra-tienda/carrito');
  await expect(page.getByText('Todavía no agregaste productos al carrito.')).toBeVisible();
  await page.goBack();
  await expect(page.getByText(product.name, { exact: true })).toBeVisible();
});

test('account menu and customer login keep checkout within the store', async ({ page, context }) => {
  const requests = await mockApi(context);
  await page.goto(shop);
  await page.locator('.store-account-trigger').hover();
  await expect(page.getByRole('link', { name: 'Crear cuenta', exact: true })).toHaveAttribute('href', `${shop}/cliente/registro`);
  await page.getByRole('link', { name: 'Ingresar', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${shop}/cliente/login$`));
  await page.goto(`${shop}/cliente/login?next=/checkout`);
  await page.getByLabel('Email', { exact: true }).fill('test@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('test-password-only');
  await page.getByRole('button', { name: /Ingresar/ }).click();
  await expect(page).toHaveURL(new RegExp(`${shop}/checkout$`));
  expect(requests.find(r => r.path === '/auth/customer/login')?.body.commerceSlug).toBe(slug);
  expect(await page.evaluate(() => localStorage.getItem('ecommerce_customer_token:cfz-carpinteria'))).toBe('test-customer-token');
  expect(await page.evaluate(() => localStorage.getItem('ecommerce_customer_token:otra-tienda'))).toBeNull();
});

test('personalizer updates its real iframe, saves, and keeps the mobile preview scrollable', async ({ page, context }) => {
  const requests = await mockApi(context);
  await context.addInitScript(() => localStorage.setItem('ecommerce_token', 'test-admin-token'));
  await page.goto('/admin/personalizar');
  const frame = page.frameLocator('iframe[title="Vista previa de la tienda real"]');
  await expect(frame.getByRole('heading', { name: initialCommerce.heroTitle })).toBeVisible();
  await page.getByLabel('Título principal de portada').fill('Muebles para tu hogar');
  await page.getByLabel('Color principal', { exact: true }).fill('#237059');
  await page.getByLabel('Mostrar acceso a la cuenta').selectOption('text');
  await page.getByLabel('Instagram', { exact: true }).fill('https://www.instagram.com/example');
  await expect(frame.getByRole('heading', { name: 'Muebles para tu hogar' })).toBeVisible();
  await expect(frame.locator('.store-account-trigger')).toHaveText('Cuenta');
  await expect(frame.getByRole('link', { name: /Instagram de/ })).toHaveAttribute('href', 'https://www.instagram.com/example');
  await expect(frame.locator('.commerce-theme')).toHaveCSS('--accent', '#237059');
  await page.getByRole('button', { name: 'Celular', exact: true }).click();
  await expect(page.locator('iframe')).toHaveClass(/mobile/);
  const embedded = page.frames().find(f => f.url().includes('personalizar=1'))!;
  expect(await embedded.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
  await page.getByRole('button', { name: 'Guardar cambios en mi tienda' }).click();
  await expect(page.getByText('Diseño guardado. Ya está aplicado a tu tienda.')).toBeVisible();
  expect(requests.find(r => r.method === 'PATCH')?.body.heroTitle).toBe('Muebles para tu hogar');
  await page.reload();
  await expect(frame.getByRole('heading', { name: 'Muebles para tu hogar' })).toBeVisible();
});

test('checkout redirects to payment and the return URL verifies the correct order', async ({ page, context }) => {
  const requests = await mockApi(context);
  await context.route('https://payment.example.test/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Pago simulado</h1>' }));
  await page.goto(shop);
  await page.getByRole('button', { name: 'Agregar +', exact: true }).click();
  await expect(page.getByText('Agregado al carrito.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Carrito: 1 productos' }).click();
  await page.getByRole('link', { name: 'Continuar compra' }).click();
  await page.getByLabel('Nombre y apellido').fill('Cliente de prueba');
  await page.getByLabel('Teléfono', { exact: true }).fill('1112345678');
  await page.getByLabel('Email', { exact: true }).fill('test@example.test');
  await page.getByRole('button', { name: 'Ir a pagar con Mercado Pago' }).click();
  await expect(page).toHaveURL('https://payment.example.test/checkout');
  expect(requests.find(r => r.path.endsWith('/checkout'))?.path).toBe(`/catalog/store/${slug}/checkout`);
  await page.goto(`${shop}/pago/resultado?order=test-order`);
  await expect(page.getByRole('heading', { name: 'Pago confirmado' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ecommerce_cart_v2:cfz-carpinteria') || 'null'))).toEqual([]);
});

test('unavailable or nonexistent shops never show a demo catalogue', async ({ page, context }) => {
  await context.route(`${api}/**`, route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto(shop);
  await expect(page.getByRole('heading', { name: 'No pudimos conectar con la tienda' })).toBeVisible();
  await context.unrouteAll();
  await context.route(`${api}/**`, route => route.fulfill({ status: 404, json: {} }));
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByRole('heading', { name: 'Tienda no disponible' })).toBeVisible();
  await expect(page.locator('.store-product-card')).toHaveCount(0);
});

test.describe('mobile touch navigation', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('storefront remains usable without horizontal overflow', async ({ page, context }) => {
    await mockApi(context);
    await page.goto(shop);
    await expect(page.getByRole('heading', { name: initialCommerce.heroTitle })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.store-account-trigger').tap();
    await expect(page.getByRole('link', { name: 'Crear cuenta', exact: true })).toBeVisible();
    await page.locator('.store-account-trigger').tap();
    await expect(page.getByRole('link', { name: 'Crear cuenta', exact: true })).toBeHidden();
  });
});
