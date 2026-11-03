// Destructive test fixtures are allowed only in the explicitly isolated CI database.
const target = new URL(process.env.TEST_DATABASE_URL || 'mysql://localhost/missing');
if (process.env.GITHUB_ACTIONS !== 'true' || !['localhost', '127.0.0.1'].includes(target.hostname) ||
    target.pathname !== '/ecommerce_test_demo_e2e') {
  throw new Error('Use the isolated GitHub Actions MySQL database ecommerce_test_demo_e2e');
}
process.env.DATABASE_URL = target.toString();
process.env.BOOTSTRAP_DEMO = 'false';
process.env.BILLING_ENABLED = 'false';
process.env.JWT_SECRET = 'isolated-demo-test-only';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const bcrypt = require('../../backend/node_modules/bcryptjs');
const { DatabaseService } = require('../../backend/dist/database/database.service');
const { runMigrations } = require('../../backend/dist/database/migrations/runner');
const { Commerce } = require('../../backend/dist/database/models/commerce.model');
const { Product } = require('../../backend/dist/database/models/product.model');
const { User } = require('../../backend/dist/database/models/user.model');
const root = path.resolve(__dirname, '../..');

async function waitForApi() {
  for (let attempt=0; attempt<100; attempt++) {
    try { if ((await fetch('http://127.0.0.1:3033/health')).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error('The isolated API did not start');
}

(async () => {
  const db = new DatabaseService();
  let api, frontend, browser;
  try {
    await runMigrations(db.sequelize);
    await db.onModuleInit();
    const hash = await bcrypt.hash('demo-test-only', 4);
    async function fixture(slug) {
      const commerce = await Commerce.create({ name: `Tienda ${slug}`, slug, active: true });
      await User.create({ commerceId: commerce.id, name: slug, email: `${slug}@example.test`, passwordHash: hash, role: 'admin' });
      const product = await Product.create({ commerceId: commerce.id, sku: 'SHARED-SKU', name: `Producto ${slug}`, price: 100, currentStock: 5 });
      return { commerce, product };
    }
    const a = await fixture('alpha'), b = await fixture('beta');
    await Product.create({ commerceId: a.commerce.id, sku: 'OTHER-SKU', name: 'Otro producto alpha', price: 200, currentStock: 5 });
    const safeEnv = { PATH: process.env.PATH, DATABASE_URL: target.toString(), BOOTSTRAP_DEMO:'false', BILLING_ENABLED:'false',
      JWT_SECRET:'isolated-demo-test-only', PORT:'3033', CORS_ORIGINS:'http://alpha.localhost:3106,http://beta.localhost:3106' };
    api = spawn(process.execPath, [path.join(root, 'backend/dist/main.js')], { cwd: root, env: safeEnv, stdio: 'ignore', detached: true });
    await waitForApi();
    frontend = spawn(process.execPath, [path.join(root,'frontend/node_modules/next/dist/bin/next'),'dev','--port','3106','--hostname','127.0.0.1'], {
      cwd:path.join(root,'frontend'), detached:true, stdio:['ignore','pipe','pipe'],
      env:{PATH:process.env.PATH,NEXT_PUBLIC_STOREFRONT_DOMAIN:'localhost',NEXT_PUBLIC_API_URL:'http://127.0.0.1:3033',NEXT_PUBLIC_ADMIN_ORIGIN:'http://admin.localhost:3106'},
    });
    await new Promise((resolve,reject) => {
      const timer=setTimeout(()=>reject(new Error('The isolated frontend did not start')),30000);
      frontend.stdout.on('data',data=>{if(String(data).includes('Ready in')){clearTimeout(timer);resolve();}});
      frontend.on('exit',code=>{clearTimeout(timer);reject(new Error(`Frontend exited: ${code}`));});
    });
    browser = await chromium.launch({ args:['--no-sandbox','--no-proxy-server'] });
    const context=await browser.newContext();
    await context.route('**/*', route => {
      const u=new URL(route.request().url());
      if ((u.port==='3106' && ['alpha.localhost','beta.localhost','admin.localhost'].includes(u.hostname)) ||
          (u.hostname==='127.0.0.1' && u.port==='3033')) return route.continue();
      return route.abort();
    });
    const page=await context.newPage();
    async function login(slug) {
      await page.goto(`http://${slug}.localhost:3106/login`, {waitUntil:'networkidle'});
      await page.getByLabel('Email').fill(`${slug}@example.test`);
      await page.getByLabel('Contraseña').fill('demo-test-only');
      await page.getByRole('button',{name:'Ingresar'}).click();
      await page.waitForURL(`http://${slug}.localhost:3106/admin/dashboard`);
    }
    await login('alpha');
    await page.goto('http://alpha.localhost:3106/admin', {waitUntil:'networkidle'});
    const row=page.getByRole('row',{name:/Producto alpha/});
    await row.waitFor();
    const images=[];
    for (const color of ['red','blue']) {
      const data=await page.evaluate(color => { const c=document.createElement('canvas'); c.width=4; c.height=4; const x=c.getContext('2d'); x.fillStyle=color; x.fillRect(0,0,4,4); return c.toDataURL('image/png').split(',')[1]; }, color);
      images.push(Buffer.from(data,'base64'));
    }
    for (const image of images) {
      await row.getByRole('button',{name:'Editar'}).click();
      const edit=page.locator('section.edit-card');
      await edit.locator('input[name="imageFile"]').setInputFiles({name:'test.png',mimeType:'image/png',buffer:image});
      await edit.getByRole('button',{name:'Guardar cambios',exact:true}).click();
      await page.getByText('Producto actualizado correctamente.').waitFor();
      await edit.waitFor({state:'detached'});
      assert.deepEqual((await a.product.reload()).imageData,image);
    }
    assert.equal((await b.product.reload()).imageData,null);
    await row.getByRole('button',{name:'Editar'}).click();
    const edit=page.locator('section.edit-card');
    await edit.locator('input[name="sku"]').fill('OTHER-SKU');
    await edit.getByRole('button',{name:'Guardar cambios',exact:true}).click();
    await page.getByText(/Ya existe un producto con ese código SKU/).waitFor();
    assert.equal(await edit.locator('input[name="sku"]').inputValue(),'OTHER-SKU');
    assert.equal((await a.product.reload()).sku,'SHARED-SKU');
    await edit.getByRole('button',{name:'Cancelar'}).click();
    const crossStatus=await page.evaluate(async id => {
      const token=localStorage.getItem('ecommerce_token');
      const response=await fetch(`http://127.0.0.1:3033/admin/catalog/products/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({name:'Cross-store change'})});
      return response.status;
    },b.product.id);
    assert.equal(crossStatus,404);
    assert.equal((await b.product.reload()).name,'Producto beta');
    await page.goto('http://alpha.localhost:3106/admin/personalizar',{waitUntil:'networkidle'});
    await page.getByLabel('Título principal de portada').fill('Portada de alpha');
    await page.getByRole('button',{name:'Guardar cambios en mi tienda'}).click();
    await page.getByText('Diseño guardado. Ya está aplicado a tu tienda.').waitFor();
    assert.equal((await a.commerce.reload()).heroTitle,'Portada de alpha');
    assert.notEqual((await b.commerce.reload()).heroTitle,'Portada de alpha');
    await page.goto('http://alpha.localhost:3106/',{waitUntil:'networkidle'});
    await page.getByRole('heading',{name:'Portada de alpha'}).waitFor();
    await page.getByRole('link',{name:'Panel del comercio'}).click();
    await page.waitForURL('http://alpha.localhost:3106/admin/dashboard');
    await page.goto('http://beta.localhost:3106/',{waitUntil:'networkidle'});
    assert.equal(await page.evaluate(()=>localStorage.getItem('ecommerce_token')),null);
    await page.getByText('Producto beta').waitFor();
    assert.equal(await page.getByText('Producto alpha',{exact:true}).count(),0);
    await login('beta');
    await page.goto('http://beta.localhost:3106/',{waitUntil:'networkidle'});
    await page.getByText('Producto beta').waitFor();
    await page.getByRole('link',{name:'Panel del comercio'}).click();
    await page.waitForURL('http://beta.localhost:3106/admin/dashboard');
    await page.goto('http://beta.localhost:3106/tienda/alpha');
    assert.equal(new URL(page.url()).pathname,'/');
    await page.getByText('Producto beta').waitFor();
    console.log('Two-store browser, real API, MySQL, image replacement, settings and isolation passed.');
  } finally {
    if (browser) await browser.close();
    for (const child of [frontend,api]) if (child) { try { process.kill(-child.pid,'SIGTERM'); } catch {} }
    await db.onModuleDestroy();
  }
})().catch(error=>{console.error(error.stack);process.exitCode=1});
