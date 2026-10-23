'use client';
import { useEffect, useRef, useState } from 'react';
import { API_URL } from '../../storefront-types';
import { ADMIN_TOKEN_KEY } from '../session';
import type { MerchantPlan } from './plan-data';

export function useMerchantPlan(page = 1) {
  const lastPage = useRef(page);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ data: MerchantPlan | null; loading: boolean; error: string; unauthorized: boolean }>({
    data: null, loading: true, error: '', unauthorized: false,
  });
  useEffect(() => {
    const token = localStorage.getItem(ADMIN_TOKEN_KEY);
    const controller = new AbortController();
    const samePage = lastPage.current === page;
    lastPage.current = page;
    setResult(previous => ({ data: samePage ? previous.data : null, loading: true, error: '', unauthorized: false }));
    if (!token) {
      setResult({ data: null, loading: false, error: 'Iniciá sesión para consultar el plan de tu tienda.', unauthorized: true });
      return () => controller.abort();
    }
    void (async () => {
      try {
        const response = await fetch(`${API_URL}/admin/plan?page=${page}`, {
          headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403) {
          if (!controller.signal.aborted) setResult({ data: null, loading: false,
            error: 'Tu sesión no permite consultar este plan. Volvé a ingresar con el administrador de la tienda.', unauthorized: true });
          return;
        }
        if (!response.ok) throw new Error('plan_unavailable');
        const data = await response.json() as MerchantPlan;
        if (!controller.signal.aborted) setResult({ data, loading: false, error: '', unauthorized: false });
      } catch {
        if (!controller.signal.aborted) setResult({ data: null, loading: false,
          error: 'No pudimos consultar tu plan. Reintentá en unos instantes.', unauthorized: false });
      }
    })();
    return () => controller.abort();
  }, [page, revision]);
  return { ...result, refresh: () => setRevision(value => value + 1) };
}
