export const ADMIN_TOKEN_KEY = 'ecommerce_token';
export const ADMIN_LOGOUT_EVENT = 'disenolys:admin-logout';

/** Clear the UI immediately; server revocation must not delay navigation. */
export function logoutAdminSession(apiUrl: string, navigate: () => void): void {
  const token = window.localStorage.getItem(ADMIN_TOKEN_KEY);
  window.localStorage.removeItem(ADMIN_TOKEN_KEY);
  window.dispatchEvent(new Event(ADMIN_LOGOUT_EVENT));
  navigate();

  if (!token) return;
  // keepalive allows the request to finish even if the document is unloaded.
  // Offline failures do not restore the local session or retain its credential.
  try {
    void fetch(`${apiUrl}/auth/admin/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      keepalive: true,
    }).catch(() => { /* Local logout is already complete. */ });
  } catch { /* A synchronous network error must not block local logout either. */ }
}
