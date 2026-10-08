'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { API_URL, StoreProduct } from './storefront-types';
import { storeStorageKey } from './storefront-routing';
import { useStorefront } from './storefront-context';

type CartItem = {
  product: StoreProduct;
  quantity: number;
};

type CartContextValue = {
  items: CartItem[];
  totalItems: number;
  subtotal: number;
  addProduct: (product: StoreProduct) => Promise<{ ok: boolean; message?: string }>;
  setQuantity: (productId: string, quantity: number) => Promise<{ ok: boolean; message?: string }>;
  removeProduct: (productId: string) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);


async function validate(COMMERCE_SLUG: string, items: Array<{ productId: string; quantity: number }>) {
  const response = await fetch(`${API_URL}/catalog/store/${COMMERCE_SLUG}/cart/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });

  if (!response.ok) return { valid: false };
  return await response.json();
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { slug: COMMERCE_SLUG } = useStorefront();
  const STORAGE_KEY = storeStorageKey('ecommerce_cart_v2', COMMERCE_SLUG);
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setItems(JSON.parse(saved));
    } catch {}
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, ready]);

  async function addProduct(product: StoreProduct) {
    const existing = items.find(item => item.product.id === product.id);
    const quantity = (existing?.quantity ?? 0) + 1;
    const validation = await validate(COMMERCE_SLUG, [{ productId: product.id, quantity }]);

    if (!validation.valid) {
      return { ok: false, message: 'No hay disponibilidad para agregar más unidades.' };
    }

    setItems(current => {
      const found = current.find(item => item.product.id === product.id);
      if (found) {
        return current.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }
      return [...current, { product, quantity: 1 }];
    });

    return { ok: true };
  }

  async function setQuantity(productId: string, quantity: number) {
    if (quantity <= 0) {
      removeProduct(productId);
      return { ok: true };
    }

    const validation = await validate(COMMERCE_SLUG, [{ productId, quantity }]);
    if (!validation.valid) {
      return { ok: false, message: 'No hay disponibilidad para esa cantidad.' };
    }

    setItems(current =>
      current.map(item =>
        item.product.id === productId ? { ...item, quantity } : item,
      ),
    );

    return { ok: true };
  }

  function removeProduct(productId: string) {
    setItems(current => current.filter(item => item.product.id !== productId));
  }

  function clearCart() {
    setItems([]);
  }

  const value = useMemo<CartContextValue>(() => ({
    items,
    totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: items.reduce((sum, item) => {
      const price = Number(item.product.offerPrice ?? item.product.price);
      return sum + price * item.quantity;
    }, 0),
    addProduct,
    setQuantity,
    removeProduct,
    clearCart,
  }), [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error('useCart must be used within CartProvider');
  return value;
}
