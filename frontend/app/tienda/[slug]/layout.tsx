import { notFound } from 'next/navigation';
import { cache } from 'react';
import { API_URL } from '../../storefront-types';
const getStore = cache(async (slug: string) => {
  const response = await fetch(`${API_URL}/catalog/store/${encodeURIComponent(slug)}`, { cache: 'no-store' });
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error('No se pudo cargar la tienda');
  return response.json();
});
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { commerce } = await getStore(slug);
  return { title: commerce.name, description: commerce.tagline || `Tienda online de ${commerce.name}` };
}
export default async function StoreLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  await getStore((await params).slug);
  return children;
}
