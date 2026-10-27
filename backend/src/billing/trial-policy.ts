export const TRIAL_DAYS = 15;
type Trial = { trialEndsAt?: Date | null; trialConvertedAt?: Date | null };

export function trialExpired(commerce: Trial, now = new Date()): boolean {
  return !!commerce.trialEndsAt && !commerce.trialConvertedAt && commerce.trialEndsAt <= now;
}

export function newTrial(now = new Date()) {
  return { trialStartedAt: now, trialEndsAt: new Date(now.getTime() + TRIAL_DAYS * 86400000), trialConvertedAt: null };
}

/** Expired owners can read their data and explicitly activate billing, never operate the store. */
export function expiredTrialAccess(role: string, method: string, path: string): boolean {
  if (!['admin', 'superadmin', 'operator'].includes(role)) return false;
  const route = path.split('?')[0].replace(/\/+$/, '');
  if (method === 'GET' && /^\/admin\/(catalog|orders|customers|dashboard|commerce|plan)(\/|$)/.test(route)) return true;
  if (method === 'POST' && route === '/auth/admin/logout') return true;
  return ['admin', 'superadmin'].includes(role) && method === 'POST' &&
    ['/admin/plan/checkout', '/admin/plan/sync'].includes(route);
}
