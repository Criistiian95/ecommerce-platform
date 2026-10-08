import './globals.css';
import { StorefrontProvider } from './storefront-context';

export const metadata = {
  title: 'Tienda Demo',
  description: 'Explorá una tienda de demostración y conocé la experiencia e-commerce para tu negocio.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body><StorefrontProvider>{children}</StorefrontProvider></body>
    </html>
  );
}
