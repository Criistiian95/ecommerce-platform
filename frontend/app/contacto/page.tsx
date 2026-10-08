import Link from 'next/link';
import styles from '../home.module.css';
export default function ContactoPage() {
  return <main className={styles.page}>
    <header className={styles.head}><Link href="/" className={styles.logo}>DISEÑO<span>LYS</span></Link><Link className={styles.secondary} href="/">Volver al inicio</Link></header>
    <section className={styles.section}>
      <span className={styles.kicker}>CONTACTO</span>
      <h1>Conocé Diseñolys para tu comercio.</h1>
      <p className={styles.sectionIntro}>Estamos preparando los canales oficiales de consultas. Mientras tanto, podés explorar cómo es la tienda y su experiencia de compra en la demostración interactiva.</p>
      <div className={styles.actions}><Link className={styles.button} href="/demo">Explorar demostración</Link><Link className={styles.secondary} href="/">Volver</Link></div>
    </section>
  </main>;
}
