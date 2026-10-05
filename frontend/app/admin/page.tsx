'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

type Category = { id: string; name: string };
type Product = {
  id: string;
  sku: string;
  name: string;
  price: string;
  cost?: string | null;
  offerPrice?: string | null;
  brand?: string | null;
  published?: boolean;
  featured?: boolean;
  currentStock: number;
  minimumStock: number;
  imageUrl?: string | null;
  description?: string | null;
  hasUploadedImage?: boolean;
  active: boolean;
  categoryId?: string | null;
  category?: { id?: string; name?: string } | null;
};

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3003';

async function fileToBase64(file: File) {
  if (file.size > 2 * 1024 * 1024) {
    throw new Error('La imagen no puede superar 2 MB.');
  }

  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) {
    throw new Error('La imagen debe ser JPG, PNG o WebP.');
  }

  return await new Promise<{ data: string; mimeType: string }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      if (comma === -1) {
        reject(new Error('No se pudo procesar la imagen.'));
        return;
      }
      resolve({
        data: result.slice(comma + 1),
        mimeType: file.type,
      });
    };
    reader.readAsDataURL(file);
  });
}

export default function AdminPage() {
  const [token, setToken] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const productsSectionRef = useRef<HTMLElement | null>(null);

  const authHeaders = useMemo(
    () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
    [token],
  );

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function apiMessage(response: Response, fallback: string) {
    try {
      const data = await response.clone().json();
      if (typeof data?.message === 'string') return data.message;
      if (Array.isArray(data?.message)) return data.message.join(', ');
    } catch {}
    return fallback;
  }

  const lowStock = products.filter(
    product => product.active && product.currentStock <= product.minimumStock,
  );

  async function refresh(currentToken = token) {
    if (!currentToken) return;
    const headers = { Authorization: `Bearer ${currentToken}` };
    const [catRes, prodRes] = await Promise.all([
      fetch(`${API}/admin/catalog/categories`, { headers }),
      fetch(`${API}/admin/catalog/products`, { headers }),
    ]);

    if (!catRes.ok || !prodRes.ok) {
      setToast({ type: 'error', text: 'No se pudo cargar el panel. Revisá el acceso del usuario.' });
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
    const target = event.currentTarget;
    const form = new FormData(target);
    setSavingCategory(true);

    try {
      const response = await fetch(`${API}/admin/catalog/categories`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ name: form.get('name') }),
      });

      if (!response.ok) {
        setToast({
          type: 'error',
          text: await apiMessage(response, 'No se pudo crear la categoría.'),
        });
        return;
      }

      target.reset();
      await refresh();
      setToast({ type: 'success', text: 'Categoría creada correctamente.' });
    } catch {
      setToast({ type: 'error', text: 'No se pudo conectar con el servidor.' });
    } finally {
      setSavingCategory(false);
    }
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    setSavingProduct(true);

    try {
      const imageFile = form.get('imageFile');
      const uploaded =
        imageFile instanceof File && imageFile.size > 0
          ? await fileToBase64(imageFile)
          : null;

      const response = await fetch(`${API}/admin/catalog/products`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          sku: form.get('sku'),
          name: form.get('name'),
          description: form.get('description') || null,
          brand: form.get('brand') || null,
          price: Number(form.get('price')),
          cost: form.get('cost') ? Number(form.get('cost')) : null,
          offerPrice: form.get('offerPrice') ? Number(form.get('offerPrice')) : null,
          published: form.get('published') === 'on',
          featured: form.get('featured') === 'on',
          categoryId: form.get('categoryId') || null,
          currentStock: Number(form.get('currentStock') || 0),
          minimumStock: Number(form.get('minimumStock') || 0),
          imageUrl: uploaded ? null : (form.get('imageUrl') || null),
          imageDataBase64: uploaded?.data ?? null,
          imageMimeType: uploaded?.mimeType ?? null,
        }),
      });

      if (!response.ok) {
        setToast({
          type: 'error',
          text: await apiMessage(response, 'No se pudo crear el producto.'),
        });
        return;
      }

      target.reset();
      await refresh();
      setToast({ type: 'success', text: 'Producto creado correctamente.' });
      window.setTimeout(() => {
        productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch {
      setToast({ type: 'error', text: 'No se pudo conectar con el servidor.' });
    } finally {
      setSavingProduct(false);
    }
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;

    const form = new FormData(event.currentTarget);
    let uploaded: { data: string; mimeType: string } | null = null;

    try {
      const imageFile = form.get('imageFile');
      uploaded =
        imageFile instanceof File && imageFile.size > 0
          ? await fileToBase64(imageFile)
          : null;
    } catch (error) {
      setToast({
        type: 'error',
        text: error instanceof Error ? error.message : 'No se pudo procesar la imagen.',
      });
      return;
    }

    const response = await fetch(`${API}/admin/catalog/products/${editing.id}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        sku: form.get('sku'),
        name: form.get('name'),
        description: form.get('description') || null,
        brand: form.get('brand') || null,
        price: Number(form.get('price')),
        cost: form.get('cost') ? Number(form.get('cost')) : null,
        offerPrice: form.get('offerPrice') ? Number(form.get('offerPrice')) : null,
        published: form.get('published') === 'on',
        featured: form.get('featured') === 'on',
        categoryId: form.get('categoryId') || null,
        minimumStock: Number(form.get('minimumStock') || 0),
        imageUrl: uploaded ? null : (form.get('imageUrl') || null),
        imageDataBase64: uploaded?.data ?? null,
        imageMimeType: uploaded?.mimeType ?? null,
        clearUploadedImage: !uploaded && Boolean(form.get('imageUrl')),
      }),
    });

    if (!response.ok) {
      setToast({ type: 'error', text: await apiMessage(response, 'No se pudo actualizar el producto.') });
      return;
    }
    setToast({ type: 'success', text: 'Producto actualizado correctamente.' });
    if (response.ok) {
      setEditing(null);
      await refresh();
    }
  }

  async function setActive(product: Product, active: boolean) {
    const response = await fetch(`${API}/admin/catalog/products/${product.id}/active`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ active }),
    });
    if (!response.ok) {
      setToast({ type: 'error', text: await apiMessage(response, 'No se pudo cambiar el estado.') });
      return;
    }
    setToast({ type: 'success', text: active ? 'Producto activado.' : 'Producto desactivado.' });
    if (response.ok) await refresh();
  }

  async function adjustStock(productId: string, delta: number) {
    if (!delta) return;
    const response = await fetch(`${API}/admin/catalog/products/${productId}/stock`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ quantityChange: delta, reason: 'Ajuste desde panel admin' }),
    });
    if (!response.ok) {
      setToast({ type: 'error', text: await apiMessage(response, 'No se pudo actualizar el stock.') });
      return;
    }
    setToast({ type: 'success', text: 'Stock actualizado.' });
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
        <div className="admin-nav-actions">
          <a className="btn secondary" href="/admin/pedidos">Pedidos</a>
          <a className="btn secondary" href="/">Ver tienda</a>
        </div>
      </header>

      {toast && (
        <div className={`toast toast-${toast.type}`} role="status" aria-live="polite">
          <span className="toast-icon">{toast.type === 'success' ? '✓' : '!'}</span>
          <span>{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Cerrar">×</button>
        </div>
      )}

      <section className="summary-grid">
        <article className="card"><strong>{products.length}</strong><span>Productos</span></article>
        <article className="card"><strong>{products.filter(p => p.active).length}</strong><span>Activos</span></article>
        <article className={`card ${lowStock.length ? 'warning-card' : ''}`}>
          <strong>{lowStock.length}</strong><span>Stock bajo</span>
        </article>
      </section>

      {lowStock.length > 0 && (
        <section className="low-stock-banner">
          <strong>Atención:</strong> {lowStock.length} producto(s) llegaron al stock mínimo o están por debajo.
        </section>
      )}

      <section className="cards admin-two-columns">
        <article className="card">
          <h2>Nueva categoría</h2>
          <form onSubmit={createCategory}>
            <label className="field">Nombre<input name="name" required /></label>
            <button className="btn primary" type="submit" disabled={savingCategory}>{savingCategory ? 'Creando...' : 'Crear categoría'}</button>
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
              <label className="field">Precio de oferta (opcional)<input name="offerPrice" type="number" min="0" step="0.01" /></label>
              <label className="field">Costo interno (opcional)<input name="cost" type="number" min="0" step="0.01" /></label>
              <label className="field">Marca (opcional)<input name="brand" /></label>
              <label className="field">Categoría
                <select name="categoryId">
                  <option value="">Sin categoría</option>
                  {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
              <label className="field">Stock inicial<input name="currentStock" type="number" min="0" defaultValue="0" /></label>
              <label className="field">Stock mínimo<input name="minimumStock" type="number" min="0" defaultValue="0" /></label>
              <div className="product-options full-field">
                <label className="check-field"><input name="published" type="checkbox" defaultChecked /> Publicado</label>
                <label className="check-field"><input name="featured" type="checkbox" /> Destacado</label>
              </div>
              <label className="field full-field">Descripción breve
                <textarea name="description" rows={3} maxLength={300} placeholder="Descripción corta del producto" />
              </label>
              <label className="field full-field">Imagen (opcional)
                <input name="imageFile" type="file" accept="image/jpeg,image/png,image/webp" />
                <small>JPG, PNG o WebP. Máximo 2 MB.</small>
              </label>
              <div className="image-divider full-field"><span>o</span></div>
              <label className="field full-field">URL de imagen (opcional)
                <input name="imageUrl" type="url" placeholder="https://..." />
              </label>
            </div>
            <button className="btn primary" type="submit" disabled={savingProduct}>{savingProduct ? 'Creando...' : 'Crear producto'}</button>
          </form>
        </article>
      </section>

      {editing && (
        <section className="card edit-card">
          <div className="section-head">
            <div>
              <h2>Editar producto</h2>
              <p>{editing.name}</p>
            </div>
            <button className="btn secondary" onClick={() => setEditing(null)}>Cancelar</button>
          </div>
          <form onSubmit={saveProduct}>
            <div className="admin-grid">
              <label className="field">SKU<input name="sku" defaultValue={editing.sku} required /></label>
              <label className="field">Nombre<input name="name" defaultValue={editing.name} required /></label>
              <label className="field">Precio<input name="price" type="number" min="0" step="0.01" defaultValue={editing.price} required /></label>
              <label className="field">Precio de oferta (opcional)<input name="offerPrice" type="number" min="0" step="0.01" defaultValue={editing.offerPrice ?? ''} /></label>
              <label className="field">Costo interno (opcional)<input name="cost" type="number" min="0" step="0.01" defaultValue={editing.cost ?? ''} /></label>
              <label className="field">Marca (opcional)<input name="brand" defaultValue={editing.brand ?? ''} /></label>
              <label className="field">Categoría
                <select name="categoryId" defaultValue={editing.categoryId ?? editing.category?.id ?? ''}>
                  <option value="">Sin categoría</option>
                  {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
              <label className="field">Stock mínimo<input name="minimumStock" type="number" min="0" defaultValue={editing.minimumStock} /></label>
              <div className="product-options full-field">
                <label className="check-field"><input name="published" type="checkbox" defaultChecked={editing.published ?? true} /> Publicado</label>
                <label className="check-field"><input name="featured" type="checkbox" defaultChecked={editing.featured ?? false} /> Destacado</label>
              </div>
              <label className="field full-field">Descripción breve
                <textarea name="description" rows={3} maxLength={300} defaultValue={editing.description ?? ''} />
              </label>
              <label className="field full-field">Imagen nueva (opcional)
                <input name="imageFile" type="file" accept="image/jpeg,image/png,image/webp" />
                <small>Si elegís una foto, reemplaza la imagen actual.</small>
              </label>
              <div className="image-divider full-field"><span>o</span></div>
              <label className="field full-field">URL de imagen (opcional)
                <input name="imageUrl" type="url" defaultValue={editing.imageUrl ?? ''} placeholder="https://..." />
              </label>
            </div>
            <button className="btn primary" type="submit">Guardar cambios</button>
          </form>
        </section>
      )}

      <section ref={productsSectionRef} className="card products-section" style={{marginTop:24}}>
        <h2>Productos</h2>
        <div style={{overflowX:'auto'}}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Producto</th><th>Categoría</th><th>Precio</th><th>Stock</th>
                <th>Publicación</th><th>Estado</th><th>Ajustar stock</th><th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {products.map(product => {
                const isLow = product.active && product.currentStock <= product.minimumStock;
                return (
                  <tr key={product.id} className={isLow ? 'low-stock-row' : product.active ? '' : 'inactive-row'}>
                    <td>
                      <div className="product-cell">
                        {product.hasUploadedImage ? (
                          <img src={`${API}/catalog/products/${product.id}/image`} alt={product.name} className="product-thumb" />
                        ) : product.imageUrl ? (
                          <img src={product.imageUrl} alt={product.name} className="product-thumb" />
                        ) : (
                          <div className="product-placeholder">IMG</div>
                        )}
                        <div>
                          <strong>{product.name}</strong>
                          <small>{product.sku}{product.brand ? ` · ${product.brand}` : ''}</small>
                          {product.description && <small className="product-description">{product.description}</small>}
                        </div>
                      </div>
                    </td>
                    <td>{product.category?.name ?? '-'}</td>
                    <td>
                      {product.offerPrice ? (
                        <div className="price-stack">
                          <small className="old-price">$ {Number(product.price).toLocaleString('es-AR')}</small>
                          <strong>$ {Number(product.offerPrice).toLocaleString('es-AR')}</strong>
                        </div>
                      ) : (
                        <>$ {Number(product.price).toLocaleString('es-AR')}</>
                      )}
                    </td>
                    <td>
                      <strong>{product.currentStock}</strong>
                      <small className="stock-min">mín. {product.minimumStock}</small>
                      {isLow && <span className="stock-badge">Stock bajo</span>}
                    </td>
                    <td>
                      <div className="publication-cell">
                        <span className={product.published ? 'status-active' : 'status-draft'}>{product.published ? 'Publicado' : 'Borrador'}</span>
                        {product.featured && <span className="featured-badge">Destacado</span>}
                      </div>
                    </td>
                    <td><span className={product.active ? 'status-active' : 'status-inactive'}>{product.active ? 'Activo' : 'Inactivo'}</span></td>
                    <td><StockAdjuster onAdjust={(delta) => adjustStock(product.id, delta)} /></td>
                    <td>
                      <div className="row-actions">
                        <button className="btn secondary" onClick={() => setEditing(product)}>Editar</button>
                        <button className="btn secondary" onClick={() => setActive(product, !product.active)}>
                          {product.active ? 'Desactivar' : 'Activar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
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
