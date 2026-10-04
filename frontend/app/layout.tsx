import './globals.css';
import { CartProvider } from './cart-context';

export const metadata = {
  title: 'Tienda Demo',
  description: 'Explorá una tienda de demostración y conocé la experiencia e-commerce para tu negocio.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body><CartProvider>{children}</CartProvider></body>
    </html>
  );
}
