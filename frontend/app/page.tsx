import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">Tienda Demo</div>
        <div className="actions">
          <button className="btn secondary">Productos</button>
          <Link className="btn primary" href="/login">Administrar tienda</Link>
        </div>
      </header>

      <section className="hero">
        <div>
          <p style={{fontWeight:800}}>PLATAFORMA E-COMMERCE</p>
          <h1>Una tienda lista para adaptarse a distintos negocios.</h1>
          <p>
            Catálogo, stock, pedidos, clientes y administración desde una misma base.
            Esta pantalla reemplaza el HTML estático del Mercado Liebre original.
          </p>
          <div className="actions" style={{marginTop:24}}>
            <button className="btn primary">Ver productos</button>
            <Link className="btn secondary" href="/login">Ingresar</Link>
          </div>
        </div>

        <div className="mock">
          <p>Panel del comercio</p>
          <h2>$ 1.248.500</h2>
          <p>Ventas del mes</p>
          <hr style={{opacity:.2}} />
          <p>Pedidos pendientes: 12</p>
          <p>Productos con stock bajo: 4</p>
          <p>Clientes nuevos: 27</p>
        </div>
      </section>

      <section className="cards">
        <article className="card"><h3>Productos</h3><p>Catálogo, categorías, variantes y precios.</p></article>
        <article className="card"><h3>Pedidos</h3><p>Seguimiento del pedido desde la compra hasta la entrega.</p></article>
        <article className="card"><h3>Stock</h3><p>Control de inventario y alertas de reposición.</p></article>
      </section>
    </main>
  );
}
