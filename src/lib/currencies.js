/**
 * lib/currencies.js
 *
 * Maps an ISO currency code to its display symbol for compact UI labels
 * (e.g. the Header currency pill). Unknown codes return the code itself.
 */

const SYMBOLS = {
  GHS: '₵',
  GBP: '£',
  USD: '$',
  EUR: '€',
  NGN: '₦',
  ZAR: 'R',
  KES: 'KSh',
};

export const currencySymbol = (code) => SYMBOLS[code] ?? code;
