import './globals.css';
import { CartProvider } from './cart-context';
import { CustomerAuthProvider } from './customer-auth-context';
import { CommerceThemeProvider } from './commerce-theme-provider';

export const metadata = {
  title: 'Tienda Demo',
  description: 'Explorá una tienda de demostración y conocé la experiencia e-commerce para tu negocio.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body><CommerceThemeProvider><CustomerAuthProvider><CartProvider>{children}</CartProvider></CustomerAuthProvider></CommerceThemeProvider></body>
    </html>
  );
}
