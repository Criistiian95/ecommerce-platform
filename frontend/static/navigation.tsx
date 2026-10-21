import { createContext, useContext, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

export const RouteParams = createContext<Record<string, string>>({});
export function useParams<T extends Record<string, string | string[]> = Record<string, string>>() {
  return useContext(RouteParams) as T;
}
export function useRouter() {
  const navigate = useNavigate();
  return useMemo(() => ({
    push: (href: string) => navigate(href),
    replace: (href: string) => navigate(href, { replace: true }),
    back: () => navigate(-1),
  }), [navigate]);
}
