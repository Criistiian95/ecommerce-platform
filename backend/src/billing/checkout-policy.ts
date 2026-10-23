/** Only provider-hosted subscription checkout links may be sent to the browser. */
export function safeSubscriptionCheckout(value: unknown, subscriptionId?: string): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port &&
        (url.hostname === 'mercadopago.com.ar' || url.hostname === 'www.mercadopago.com.ar') &&
        url.pathname === '/subscriptions/checkout' &&
        (!subscriptionId || url.searchParams.get('preapproval_id') === subscriptionId)) return url.toString();
  } catch { /* Invalid provider response. */ }
  return null;
}

/** Mercado Pago may omit payer_email in a preapproval response (including its documented examples).
 * Correlation still requires the exact subscription ID, merchant reference and verified collector.
 * An explicit, non-empty conflicting email remains a mismatch.
 */
export function subscriptionEmailMatches(value: unknown, expected: string): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value !== 'string') return false;
  return !value.trim() || value.trim().toLowerCase() === expected.trim().toLowerCase();
}
