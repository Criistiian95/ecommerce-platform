import './globals.css';

export const metadata = {
  title: 'Tienda Demo',
  description: 'Base comercial e-commerce multi-comercio',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
