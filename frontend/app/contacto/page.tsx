import Link from 'next/link';
import styles from '../home.module.css';
import PlatformWhatsApp, { platformWhatsAppUrl } from '../platform-whatsapp';
export default function ContactoPage() {
  const hasWhatsApp = Boolean(platformWhatsAppUrl());
  return <main className={styles.page}>
    <header className={styles.head}><Link href="/" className={styles.logo}>DISEÑO<span>LYS</span></Link><Link className={styles.secondary} href="/">Volver al inicio</Link></header>
    <section className={styles.section}>
      <span className={styles.kicker}>CONTACTO</span>
      <h1>Conocé Diseñolys para tu comercio.</h1>
      <p className={styles.sectionIntro}>{hasWhatsApp ? 'Contanos qué vendés y qué necesitás para tu tienda online. Escribinos por WhatsApp y te ayudamos a conocer Diseñolys.' : 'Estamos preparando los canales oficiales de consultas. Mientras tanto, podés explorar cómo es la tienda y su experiencia de compra en la demostración interactiva.'}</p>
      <div className={styles.actions}><PlatformWhatsApp /><Link className={hasWhatsApp ? styles.secondary : styles.button} href="/demo">Explorar demostración</Link><Link className={styles.secondary} href="/">Volver</Link></div>
      {hasWhatsApp && <p className={styles.sectionIntro}>Se abrirá WhatsApp con una consulta preparada. Podés editarla antes de enviarla.</p>}
    </section>
  </main>;
}

