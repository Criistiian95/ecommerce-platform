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
  updatedAt?: string;
  featured: boolean;
  available: boolean;
  category?: StoreCategory | null;
};

export type StoreCatalog = {
  commerce: {
    updatedAt?: string;
    name: string;
    slug: string;
    tagline?: string | null;
    headerTagline?: string | null;
    headerDisplay?: string;
    fontFamily?: string;
    accountDisplay?: string;
    instagramUrl?: string | null;
    facebookUrl?: string | null;
    tiktokUrl?: string | null;
    youtubeUrl?: string | null;
    heroTitle?: string | null;
    heroButtonText?: string | null;
    announcementText?: string | null;
    heroLayout?: string;
    backgroundColor?: string;
    coverPreset?: string;
    hasUploadedCover?: boolean;
    coverUrl?: string;
    primaryColor: string;
    secondaryColor: string;
    logoUrl?: string | null;
    hasUploadedLogo?: boolean;
    whatsapp?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    address?: string | null;
    businessHours?: string | null;
    pickupEnabled: boolean;
    shippingEnabled: boolean;
  };
  categories: StoreCategory[];
  products: StoreProduct[];
};

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3003';
