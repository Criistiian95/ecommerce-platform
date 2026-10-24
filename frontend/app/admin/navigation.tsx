'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef } from 'react';
import AdminLogoutButton from './logout-button';
import AdminStoreLink from './store-link';
import styles from './navigation.module.css';

const sections = [
  { href: '/admin/dashboard', label: 'Dashboard' },
  { href: '/admin', label: 'Productos' },
  { href: '/admin/pedidos', label: 'Pedidos' },
  { href: '/admin/clientes', label: 'Clientes' },
  { href: '/admin/plan', label: 'Mi plan' },
  { href: '/admin/configuracion', label: 'Configuración' },
  { href: '/admin/personalizar', label: 'Personalizar mi tienda' },
];

export default function AdminNavigation() {
  const pathname = usePathname();
  const details = useRef<HTMLDetailsElement>(null);
  const menuId = useId();

  useEffect(() => { if (details.current) details.current.open = false; }, [pathname]);
  useEffect(() => {
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !details.current?.contains(event.target) && details.current) details.current.open = false;
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape' && details.current?.open) {
        details.current.open = false;
        details.current.querySelector('summary')?.focus();
      }
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, []);

  return <div className={`admin-nav ${styles.navigation}`}>
    <details ref={details} className={styles.dropdown} onBlur={event => {
      if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
    }}>
      <summary className={styles.toggle} aria-label="Menú del panel" aria-controls={menuId}>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        <span>Menú</span>
      </summary>
      <nav id={menuId} className={styles.menu} aria-label="Módulos del panel">
        <span className={styles.caption}>ADMINISTRAR TIENDA</span>
        {sections.map(section => {
          const active = pathname === section.href || (section.href !== '/admin' && pathname.startsWith(`${section.href}/`));
          return <Link key={section.href} href={section.href} className={`${styles.item} ${active ? styles.active : ''}`}
            aria-current={active ? 'page' : undefined} onClick={() => { if (details.current) details.current.open = false; }}>
            {section.label}<span aria-hidden="true">{active ? '●' : '›'}</span>
          </Link>;
        })}
      </nav>
    </details>
    <div className={styles.actions} aria-label="Acciones de la tienda">
      <AdminStoreLink />
      <AdminLogoutButton />
    </div>
  </div>;
}
