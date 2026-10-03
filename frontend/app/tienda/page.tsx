import StorefrontClient from '../storefront-client';
import styles from './store.module.css';

export default function TiendaPage(){
  return <main className={`${styles.root} store-shell`}><StorefrontClient/></main>;
}
