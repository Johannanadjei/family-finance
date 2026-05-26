/**
 * features/onboarding/onboarding.validation.js
 *
 * Pure validation functions for the onboarding flow.
 * Each function returns null on success or an error string on failure.
 * Never throws — always returns null or string.
 * Components call these before calling onNext().
 */

import { validateCurrency } from '../../lib/validation';

/**
 * Validate Step 1 — Centre details.
 * @param {{ name: string, currency: string }} data
 * @returns {string|null}
 */
export const validateCentreStep = ({ name, currency }) => {
  if (!name?.trim())   return 'Please give your BOS Hub a name';
  if (name.trim().length > 50) return 'BOS Hub name must be 50 characters or less';
  try {
    validateCurrency(currency);
  } catch {
    return 'Please select a valid currency';
  }
  return null;
};

/**
 * Validate Step 2 — Income streams.
 * @param {IncomeStream[]} incomes
 * @returns {string|null}
 */
export const validateIncomeStep = (incomes) => {
  if (!incomes.length) return 'Please add at least one income stream';
  for (const income of incomes) {
    if (!income.label?.trim())              return 'Every income stream needs a name';
    if (Number(income.expected_amount) <= 0) return 'Every income stream needs an amount greater than zero';
    if (income.pay_day_type === 'fixed_date') {
      if (!income.pay_day || income.pay_day < 1 || income.pay_day > 31) {
        return 'Please enter a valid pay day between 1 and 31';
      }
    }
  }
  return null;
};

/**
 * Validate Step 3 — Budget categories.
 * @param {Category[]} categories
 * @returns {string|null}
 */
export const validateCategoriesStep = (categories) => {
  if (!categories.length) return 'Please add at least one budget category';
  for (const cat of categories) {
    if (!cat.name?.trim())           return 'Every category needs a name';
    if (Number(cat.budget_amount) < 0) return 'Budget amounts cannot be negative';
  }
  return null;
};

/**
 * Validate Step 4 — Surplus target.
 * @param {number|string} target
 * @returns {string|null}
 */
export const validateTargetStep = (target) => {
  const n = Number(target);
  if (isNaN(n))  return 'Please enter a valid number for your surplus target';
  if (n < 0)     return 'Surplus target cannot be negative';
  return null;
};
