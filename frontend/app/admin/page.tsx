'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type Category = { id: string; name: string };
type Product = {
  id: string;
  sku: string;
  name: string;
  price: string;
  currentStock: number;
  minimumStock: number;
  category?: { name?: string } | null;
};

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3003';

export default function AdminPage() {
  const [token, setToken] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [message, setMessage] = useState('');
  const authHeaders = useMemo(
    () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
    [token],
  );

  async function refresh(currentToken = token) {
    if (!currentToken) return;
    const headers = { Authorization: `Bearer ${currentToken}` };
    const [catRes, prodRes] = await Promise.all([
      fetch(`${API}/admin/catalog/categories`, { headers }),
      fetch(`${API}/admin/catalog/products`, { headers }),
    ]);
    if (!catRes.ok || !prodRes.ok) {
      setMessage('No se pudo cargar el panel. Revisá el acceso del usuario.');
      return;
    }
    setCategories(await catRes.json());
    setProducts(await prodRes.json());
  }

  useEffect(() => {
    const saved = localStorage.getItem('ecommerce_token') ?? '';
    setToken(saved);
    void refresh(saved);
  }, []);

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(`${API}/admin/catalog/categories`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: form.get('name') }),
    });
    setMessage(response.ok ? 'Categoría creada.' : 'No se pudo crear la categoría.');
    if (response.ok) {
      event.currentTarget.reset();
      await refresh();
    }
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(`${API}/admin/catalog/products`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        sku: form.get('sku'),
        name: form.get('name'),
        price: Number(form.get('price')),
        categoryId: form.get('categoryId') || null,
        currentStock: Number(form.get('currentStock') || 0),
        minimumStock: Number(form.get('minimumStock') || 0),
      }),
    });
    setMessage(response.ok ? 'Producto creado.' : 'No se pudo crear el producto.');
    if (response.ok) {
      event.currentTarget.reset();
      await refresh();
    }
  }

  async function adjustStock(productId: string, delta: number) {
    if (!delta) return;
    const response = await fetch(`${API}/admin/catalog/products/${productId}/stock`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ quantityChange: delta, reason: 'Ajuste desde panel admin' }),
    });
    setMessage(response.ok ? 'Stock actualizado.' : 'No se pudo actualizar el stock.');
    if (response.ok) await refresh();
  }

  if (!token) {
    return (
      <main className="shell">
        <div className="card">
          <h1>Panel administrador</h1>
          <p>Primero iniciá sesión con un usuario administrador del comercio.</p>
          <a className="btn primary" href="/login">Ir al login</a>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="brand">Panel del comercio</div>
          <small>Productos, categorías y stock</small>
        </div>
        <a className="btn secondary" href="/">Ver tienda</a>
      </header>

      {message && <p>{message}</p>}

      <section className="cards" style={{gridTemplateColumns:'1fr 2fr'}}>
        <article className="card">
          <h2>Nueva categoría</h2>
          <form onSubmit={createCategory}>
            <label className="field">Nombre<input name="name" required /></label>
            <button className="btn primary" type="submit">Crear categoría</button>
          </form>
          <hr />
          <h3>Categorías</h3>
          {categories.map(category => <p key={category.id}>{category.name}</p>)}
        </article>

        <article className="card">
          <h2>Nuevo producto</h2>
          <form onSubmit={createProduct}>
            <div className="admin-grid">
              <label className="field">SKU<input name="sku" required /></label>
              <label className="field">Nombre<input name="name" required /></label>
              <label className="field">Precio<input name="price" type="number" min="0" step="0.01" required /></label>
              <label className="field">Categoría
                <select name="categoryId">
                  <option value="">Sin categoría</option>
                  {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
              <label className="field">Stock inicial<input name="currentStock" type="number" min="0" defaultValue="0" /></label>
              <label className="field">Stock mínimo<input name="minimumStock" type="number" min="0" defaultValue="0" /></label>
            </div>
            <button className="btn primary" type="submit">Crear producto</button>
          </form>
        </article>
      </section>

      <section className="card" style={{marginTop:24}}>
        <h2>Productos</h2>
        <div style={{overflowX:'auto'}}>
          <table className="admin-table">
            <thead>
              <tr><th>SKU</th><th>Producto</th><th>Categoría</th><th>Precio</th><th>Stock</th><th>Mínimo</th><th>Ajustar</th></tr>
            </thead>
            <tbody>
              {products.map(product => (
                <tr key={product.id}>
                  <td>{product.sku}</td>
                  <td>{product.name}</td>
                  <td>{product.category?.name ?? '-'}</td>
                  <td>$ {Number(product.price).toLocaleString('es-AR')}</td>
                  <td>{product.currentStock}</td>
                  <td>{product.minimumStock}</td>
                  <td>
                    <StockAdjuster onAdjust={(delta) => adjustStock(product.id, delta)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function StockAdjuster({ onAdjust }: { onAdjust: (delta: number) => void }) {
  const [value, setValue] = useState('');
  return (
    <div className="stock-adjust">
      <input value={value} onChange={e => setValue(e.target.value)} type="number" placeholder="+/-" />
      <button className="btn secondary" onClick={() => {
        const delta = Number(value);
        if (delta) {
          onAdjust(delta);
          setValue('');
        }
      }}>Aplicar</button>
    </div>
  );
}
