import './globals.css';
import { headers } from 'next/headers';
import { StorefrontProvider } from './storefront-context';
import { tenantSlugFromHost } from './tenant-host';

export const metadata = {
  title: 'Diseñolys | Tu tienda online, con tu identidad',
  description: 'Tiendas online para comercios argentinos. Catálogo, pedidos, clientes y control de stock en una sola plataforma.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const host = (await headers()).get('host');
  const domainSlug = tenantSlugFromHost(host);
  return (
    <html lang="es">
      <body><StorefrontProvider domainSlug={domainSlug}>{children}</StorefrontProvider></body>
    </html>
  );
}
