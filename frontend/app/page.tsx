import Link from 'next/link';
import Image from 'next/image';
import styles from './home.module.css';
import PlatformWhatsApp from './platform-whatsapp';

export const metadata = {
  title: 'Diseños L&S | Creá tu tienda online · 15 días gratis',
  description: 'Creá tu tienda online con tu logo y tus productos. Probá Diseños L&S durante 15 días sin tarjeta. Después, $39.900 ARS por mes si elegís continuar.',
};
const features = [
  ['01', 'Una tienda que se siente tuya', 'Tu logo, tus colores y tus productos. Personalizá tu vidriera desde el panel, sin programar.'],
  ['02', 'Del carrito al pago', 'Tus clientes eligen, hacen su pedido y pagan con Mercado Pago cuando conectás la cuenta de tu comercio.'],
  ['03', 'Todo a mano', 'Administrá productos, stock, pedidos y clientes desde el mismo lugar, en el celular o la computadora.'],
];
export default function HomePage() {
  return <main className={styles.page}>
    <a className={styles.skip} href="#contenido">Ir al contenido</a>
    <div className={styles.topline}>Tu próximo paso empieza acá. <strong>15 días gratis, sin tarjeta.</strong></div>
    <header className={styles.head}>
      <Link href="/" className={styles.logo} aria-label="Diseños L&S · Inicio"><Image src="/brand/disenos-ls.png" alt="Diseños L&S · Tiendas online para comercios" width={210} height={210} priority /></Link>
      <nav className={styles.links} aria-label="Navegación principal">
        <a className={styles.desktopLink} href="#como-funciona">Cómo funciona</a><a className={styles.desktopLink} href="#precio">Precio</a>
        <Link className={styles.login} href="/login">Ingresar</Link><Link className={styles.navCta} href="/registro">Crear mi tienda <span aria-hidden="true">↗</span></Link>
      </nav>
    </header>
    <section id="contenido" className={styles.hero}>
      <div className={styles.heroCopy}>
        <span className={styles.eyebrow}><span /> PARA COMERCIOS CON GANAS DE CRECER</span>
        <h1>Tu negocio merece<br />su propia <em>tienda online.</em></h1>
        <p>Convertí tus productos en una tienda con tu marca. Compartí el enlace, recibí pedidos y organizá tu negocio desde un solo lugar.</p>
        <div className={styles.actions}><Link className={styles.button} href="/registro">Crear mi tienda gratis <span aria-hidden="true">↗</span></Link><Link className={styles.textLink} href="/demo">Explorar la demo <span aria-hidden="true">→</span></Link></div>
        <div className={styles.reassurance}><span>✓ 15 días para probar</span><span>✓ Sin tarjeta</span><span>✓ Alta online</span></div>
        <small className={styles.priceNote}>Después, $39.900 ARS/mes si decidís continuar.</small>
      </div>
      <div className={styles.heroVisual}>
        <div className={styles.visualLabel}>TU MARCA. TU CATÁLOGO. TU ESPACIO.</div>
        <div className={styles.browser} aria-label="Ejemplo ilustrativo de una tienda de decoración">
          <div className={styles.browserBar}><span aria-hidden="true">● ● ●</span><small>tu-tienda / inicio</small><span aria-hidden="true">↗</span></div>
          <div className={styles.storeNav}><strong>casa<span>alma.</span></strong><span>Inicio &nbsp; Colección &nbsp; ♡</span></div>
          <div className={styles.storeHero}><Image src="/covers/home.webp" alt="Ambiente de hogar con muebles de madera" width={800} height={500} priority /><div><small>ESPACIOS QUE INSPIRAN</small><strong>Un poco más<br />de hogar.</strong><span>Conocé la colección →</span></div></div>
          <div className={styles.storeBottom}><span>Diseño para todos los días</span><span>Tu catálogo, a un clic ↗</span></div>
          <div className={styles.productRow}><div><span className={styles.swatchOne} /><small>Madera natural</small></div><div><span className={styles.swatchTwo} /><small>Texturas suaves</small></div><div><span className={styles.swatchThree} /><small>Detalles únicos</small></div></div>
        </div>
        <div className={styles.floatCard}><span className={styles.check}>✓</span><div><strong>Lista para compartir</strong><small>Tu comercio tiene su propio enlace</small></div></div>
        <p className={styles.visualNote}>Vista ilustrativa. Personalizá la tuya con tus productos.</p>
      </div>
    </section>
    <div className={styles.benefitStrip}><span>Tu logo y tus colores</span><span>Catálogo y stock</span><span>Pedidos organizados</span><span>Cobros con Mercado Pago*</span></div>
    <section id="como-funciona" className={styles.section}>
      <div className={styles.sectionHeading}><span className={styles.eyebrow}>DE LA IDEA A TU TIENDA</span><h2>Empezá hoy.<br />Hacela tuya, paso a paso.</h2><p>No necesitás saber programar. Registrate y empezá a preparar tu negocio para vender online.</p></div>
      <div className={styles.steps}>{[['1','Creá tu cuenta','Elegí el nombre de tu tienda y tus datos de acceso. La prueba empieza al registrarte.'],['2','Dale tu identidad','Subí tu logo, elegí colores y cargá tus primeros productos con fotos y precios.'],['3','Compartí tu tienda','Conectá Mercado Pago para cobrar y compartí el enlace con tus clientes.']].map(([n,title,description])=><article key={n}><span>{n}</span><h3>{title}</h3><p>{description}</p></article>)}</div>
    </section>
    <section className={styles.featuresSection}><div className={styles.section}><span className={styles.eyebrow}>MÁS SIMPLE PARA VOS Y TUS CLIENTES</span><h2>Tu vidriera por fuera.<br />Tu negocio organizado por dentro.</h2><div className={styles.features}>{features.map(([n,title,description])=><article key={n}><span>{n} /</span><h3>{title}</h3><p>{description}</p></article>)}</div><p className={styles.finePrint}>*Los cobros de tus ventas requieren conectar tu cuenta de Mercado Pago. Sus condiciones y costos son independientes del abono de Diseños L&S.</p></div></section>
    <section id="precio" className={`${styles.section} ${styles.pricing}`}>
      <div><span className={styles.eyebrow}>PROBALA EN TU PROPIO NEGOCIO</span><h2>Primero conocela.<br />Después, elegí seguir.</h2><p>Tenés 15 días para armar tu tienda y probar cómo se adapta a tu comercio. Sin ingresar una tarjeta y sin cobros automáticos durante la prueba.</p><Link className={styles.textLink} href="/contacto">¿Tenés alguna duda? Hablemos →</Link></div>
      <article className={styles.priceCard}><span className={styles.trialBadge}>15 DÍAS GRATIS</span><h3>Tu tienda online</h3><div className={styles.amount}>$39.900 <span>ARS / mes</span></div><p>Al terminar la prueba, si elegís continuar.</p><ul><li>Catálogo, productos y stock</li><li>Personalización con tu marca</li><li>Gestión de pedidos y clientes</li><li>Conexión con Mercado Pago</li></ul><Link className={styles.button} href="/registro">Empezar mis 15 días gratis ↗</Link><small>Sin tarjeta para probar. El abono se activa cuando autorizás la suscripción mensual en Mercado Pago.</small></article>
    </section>
    <section className={`${styles.section} ${styles.faq}`}><div><span className={styles.eyebrow}>ANTES DE EMPEZAR</span><h2>Resolvamos tus dudas.</h2></div><div>{[['¿Necesito una tarjeta para probar?','No. Creás tu cuenta y tenés 15 días gratis desde el registro. No se genera una suscripción ni un cobro por crear la tienda.'],['¿Qué pasa cuando terminan los 15 días?','La tienda deja de recibir pedidos. Tus productos y datos se conservan, y podés entrar al panel para consultarlos y activar el abono desde Mi plan.'],['¿Cómo empiezo a cobrar mis ventas?','Conectá la cuenta de Mercado Pago de tu comercio desde el panel. Esa cuenta recibe los cobros de tus ventas; es independiente del abono de la plataforma.'],['¿Puedo usar mi logo y mis colores?','Sí. Personalizá la tienda desde tu panel y cargá tus productos con sus fotos, categorías y precios.'],['¿Cuándo empieza el abono?','Cuando decidís activar el plan y se acredita el primer pago. Si lo activás antes de terminar la prueba, el período pago empieza con esa acreditación. La suscripción se renueva mensualmente.']].map(([q,a])=><details key={q}><summary>{q}<span aria-hidden="true">+</span></summary><p>{a}</p></details>)}</div></section>
    <section className={styles.finalCta}><span className={styles.eyebrow}>EL PRÓXIMO PASO ES TUYO</span><h2>Que tu próximo cliente<br />encuentre tu tienda.</h2><Link className={styles.button} href="/registro">Crear mi tienda gratis ↗</Link><p>15 días gratis · Sin tarjeta · Con tu identidad</p></section>
    <footer className={styles.foot}><strong>Diseños L&S</strong><span>Tiendas online para comercios argentinos.</span><nav aria-label="Enlaces del pie"><Link href="/demo">Demo</Link><Link href="/contacto">Contacto</Link><Link href="/login">Ingresar</Link></nav><small>© {new Date().getFullYear()} Diseños L&S</small></footer>
    <PlatformWhatsApp floating />
  </main>;
}
