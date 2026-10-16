import StorefrontClient from '../storefront-client';
import styles from '../tienda/store.module.css';

export default function DemoPage(){
  return (
    <main className={`${styles.root} store-shell storefront-page`}>
      <StorefrontClient demoMode />
    </main>
  );
}
