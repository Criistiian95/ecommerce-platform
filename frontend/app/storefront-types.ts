export type StoreCategory = {
  id: string;
  name: string;
};

export type StoreProduct = {
  id: string;
  name: string;
  description?: string | null;
  brand?: string | null;
  price: string;
  offerPrice?: string | null;
  imageUrl?: string | null;
  hasUploadedImage?: boolean;
  featured: boolean;
  available: boolean;
  category?: StoreCategory | null;
};

export type StoreCatalog = {
  commerce: {
    name: string;
    slug: string;
  };
  categories: StoreCategory[];
  products: StoreProduct[];
};

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3003';
