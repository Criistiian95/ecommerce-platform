/** Fixed ARS monthly subscription policy for new Diseñolys merchants.
 * Existing paid merchants are unaffected until explicitly migrated.
 */
export const SUBSCRIPTION_AMOUNT_ARS = 39900;
export const SUBSCRIPTION_CURRENCY = 'ARS';
export const SUBSCRIPTION_INTERVAL = { frequency: 1, frequency_type: 'months' } as const;
export const SUBSCRIPTION_REASON = 'Diseñolys - Tienda Online';
export function subscriptionConfiguration() {
  return {
    reason: SUBSCRIPTION_REASON,
    auto_recurring: {
      ...SUBSCRIPTION_INTERVAL,
      transaction_amount: SUBSCRIPTION_AMOUNT_ARS,
      currency_id: SUBSCRIPTION_CURRENCY,
    },
  };
}
