/**
 * lib/pricing.js
 *
 * Pro pricing — amounts, currency, and Paystack plan codes.
 * Separate from lib/plans.js (which holds capability limits, no money).
 *
 * Amounts are in PESEWAS (the smallest GHS unit) per Paystack convention — Paystack
 * expects `amount` in the currency subunit (×100). ₵40 → 4000, ₵400 → 40000.
 * Display to the user as cedis via formatCedis().
 *
 * paystack_plan_code is null until the plans are created in the Paystack dashboard;
 * fill these in (and create the webhook) when the payment commit lands.
 *
 * Annual = 2 months free: ₵40 × 12 = ₵480 → charged ₵400 → saves ₵80 (~17%).
 */

export const PRICING = {
  currency: 'GHS',
  monthly: {
    amount:             4000,   // pesewas (₵40)
    display:            '₵40',
    period:             'month',
    paystack_plan_code: null,   // set after Paystack dashboard creates the plan
  },
  annual: {
    amount:             40000,  // pesewas (₵400)
    display:            '₵400',
    period:             'year',
    savings_display:    '₵80',  // ₵40×12 − ₵400
    savings_percent:    17,
    paystack_plan_code: null,
  },
};

/**
 * Format a pesewas amount as a whole-cedi string.
 * @param {number} pesewas — amount in the GHS subunit
 * @returns {string} e.g. '₵40'
 */
export function formatCedis(pesewas) {
  return `₵${(pesewas / 100).toFixed(0)}`;
}
