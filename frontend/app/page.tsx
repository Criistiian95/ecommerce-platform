import Link from 'next/link';
import styles from './home.module.css';

export default function HomePage() {
  return <main className={styles.page}>
    <header className={styles.head}>
      <Link href="/" className={styles.logo}>DISEÑO<span>LYS</span></Link>
      <nav className={styles.links} aria-label="Navegación">
        <a href="#funciones">Funciones</a>
        <Link href="/demo">Ver demostración</Link>
        <Link className={styles.button} href="/contacto">Solicitá información</Link>
      </nav>
    </header>
    <section className={styles.hero}>
      <div>
        <span className={styles.kicker}>TIENDAS ONLINE PARA COMERCIOS ARGENTINOS</span>
        <h1>Tu tienda online,<br/><em>con tu identidad.</em></h1>
        <p>Mostrá tus productos, recibí pedidos y administrá tu negocio desde un solo lugar. Una tienda que lleve tu logo, tus colores y el nombre de tu comercio.</p>
        <div className={styles.actions}>
          <Link className={styles.button} href="/demo">Explorar la tienda demo ↗</Link>
          <Link className={styles.secondary} href="/contacto">Solicitá información</Link>
        </div>
        <p className={styles.demoNote}>Conocé cómo funciona la experiencia de compra antes de contratar.</p>
      </div>
      <div className={styles.mock} aria-label="Vista ilustrativa de una tienda online">
        <div className={styles.mockNav}><span>Tu comercio</span><span className={styles.pill}>Carrito (2)</span></div>
        <div className={styles.mockBanner}><strong>Tu tienda, tu estilo.</strong><small>Productos, ofertas y novedades en un solo lugar.</small><span className={styles.pill}>Ver productos →</span></div>
        <div className={styles.mockGrid}>
          <div className={styles.mockProd}><span>👜</span><strong>Accesorios</strong><small>Tu catálogo</small></div>
          <div className={styles.mockProd}><span>👟</span><strong>Calzado</strong><small>Tus precios</small></div>
          <div className={styles.mockProd}><span>🎧</span><strong>Tecnología</strong><small>Tus ofertas</small></div>
        </div>
      </div>
    </section>
    <section id="funciones" className={styles.section}>
      <h2>Tu comercio, organizado para vender online.</h2>
      <p className={styles.sectionIntro}>Diseñolys combina una vidriera digital para tus clientes con herramientas para administrar productos, compras y ventas. Cada comercio tiene sus propios datos.</p>
      <div className={styles.features}>
        <article className={styles.feature}><span>🛍️</span><h3>Catálogo personalizado</h3><p>Publicá productos, categorías, imágenes, precios y ofertas con la identidad de tu marca.</p></article>
        <article className={styles.feature}><span>💳</span><h3>Pedidos y pagos</h3><p>Carrito, pedidos y checkout integrado con Mercado Pago mediante la cuenta del comercio.</p></article>
        <article className={styles.feature}><span>📦</span><h3>Stock y productos</h3><p>Organizá tu inventario, controlá existencias y registrá movimientos de stock.</p></article>
        <article className={styles.feature}><span>👥</span><h3>Clientes y cuentas</h3><p>Registro de clientes, datos de contacto e historial de compras asociado a cada tienda.</p></article>
        <article className={styles.feature}><span>📊</span><h3>Panel de control</h3><p>Consultá las ventas cobradas, pedidos, productos destacados y alertas de inventario.</p></article>
        <article className={styles.feature}><span>🎨</span><h3>Tu identidad visual</h3><p>Configurá logo, colores, información del local y métodos de entrega disponibles.</p></article>
      </div>
    </section>
    <section className={styles.section}>
      <h2>Una solución pensada para negocios de acá.</h2>
      <div className={styles.steps}>
        <div className={styles.step}><strong>01</strong><h3>Mostrá tu negocio</h3><p>Una tienda online donde tus clientes conocen tus productos.</p></div>
        <div className={styles.step}><strong>02</strong><h3>Recibí pedidos</h3><p>Un proceso de compra simple para celular y computadora.</p></div>
        <div className={styles.step}><strong>03</strong><h3>Gestioná desde tu panel</h3><p>Controlá productos, clientes, pedidos y ventas desde un mismo lugar.</p></div>
      </div>
    </section>
    <section className={styles.cta}>
      <div><h2>¿Querés tu propia tienda online?</h2><p>Contanos sobre tu comercio y te explicamos cómo funciona Diseñolys.</p></div>
      <Link className={styles.button} href="/contacto">Solicitá información →</Link>
    </section>
    <footer className={styles.foot}>© {new Date().getFullYear()} Diseñolys · Tu tienda online, con tu identidad. · <Link href="/demo">Demostración</Link> · <Link href="/login">Acceso para comercios</Link></footer>
  </main>;
}