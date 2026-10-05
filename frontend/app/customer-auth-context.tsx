'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { API_URL } from './storefront-types';
import { COMMERCE_SLUG } from './storefront-config';

export type CustomerUser = {
  id: string;
  commerceId: string;
  name: string;
  email: string;
  phone?: string | null;
  defaultAddress?: string | null;
  role: 'customer';
};

type AuthResult = { ok: boolean; message?: string };

type CustomerAuthValue = {
  user: CustomerUser | null;
  token: string;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthResult>;
  register: (input: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    defaultAddress?: string;
  }) => Promise<AuthResult>;
  updateProfile: (input: {
    name?: string;
    phone?: string | null;
    defaultAddress?: string | null;
  }) => Promise<AuthResult>;
  logout: () => void;
};

const CustomerAuthContext = createContext<CustomerAuthValue | null>(null);
const TOKEN_KEY = 'ecommerce_customer_token';

export function CustomerAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CustomerUser | null>(null);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadProfile(currentToken: string) {
    const response = await fetch(`${API_URL}/auth/customer/me`, {
      headers: { Authorization: `Bearer ${currentToken}` },
      cache: 'no-store',
    });

    if (!response.ok) throw new Error();
    setUser(await response.json());
  }

  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY) ?? '';
    if (!saved) {
      setLoading(false);
      return;
    }

    setToken(saved);
    void loadProfile(saved)
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken('');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string): Promise<AuthResult> {
    try {
      const response = await fetch(`${API_URL}/auth/customer/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commerceSlug: COMMERCE_SLUG, email, password }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        return { ok: false, message: data?.message ?? 'No se pudo iniciar sesión.' };
      }

      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      setUser(data.user);
      return { ok: true };
    } catch {
      return { ok: false, message: 'No se pudo conectar con el servidor.' };
    }
  }

  async function register(input: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    defaultAddress?: string;
  }): Promise<AuthResult> {
    try {
      const response = await fetch(`${API_URL}/auth/customer/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commerceSlug: COMMERCE_SLUG, ...input }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        return { ok: false, message: data?.message ?? 'No se pudo crear la cuenta.' };
      }

      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      setUser(data.user);
      return { ok: true };
    } catch {
      return { ok: false, message: 'No se pudo conectar con el servidor.' };
    }
  }

  async function updateProfile(input: {
    name?: string;
    phone?: string | null;
    defaultAddress?: string | null;
  }): Promise<AuthResult> {
    if (!token) return { ok: false, message: 'Iniciá sesión nuevamente.' };

    try {
      const response = await fetch(`${API_URL}/auth/customer/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(input),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        return { ok: false, message: data?.message ?? 'No se pudo actualizar el perfil.' };
      }

      setUser(data);
      return { ok: true };
    } catch {
      return { ok: false, message: 'No se pudo conectar con el servidor.' };
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken('');
    setUser(null);
  }

  const value = useMemo<CustomerAuthValue>(() => ({
    user,
    token,
    loading,
    login,
    register,
    updateProfile,
    logout,
  }), [user, token, loading]);

  return (
    <CustomerAuthContext.Provider value={value}>
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth() {
  const value = useContext(CustomerAuthContext);
  if (!value) throw new Error('useCustomerAuth must be used within CustomerAuthProvider');
  return value;
}
