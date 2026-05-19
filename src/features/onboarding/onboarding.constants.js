/**
 * features/onboarding/onboarding.constants.js
 *
 * Static configuration for the onboarding flow.
 * No user-specific data. No financial calculations.
 * All values here are app-level configuration — not per-user data.
 */

export const STEPS = ['Centre', 'Income', 'Categories', 'Target', 'Complete'];

export const MAX_FREE_INCOMES = 2;
export const MAX_FREE_MEMBERS = 2;

export const CURRENCIES = [
  { code: 'GHS', label: 'GHS — Ghanaian Cedi'       },
  { code: 'USD', label: 'USD — US Dollar'             },
  { code: 'GBP', label: 'GBP — British Pound'         },
  { code: 'EUR', label: 'EUR — Euro'                  },
  { code: 'NGN', label: 'NGN — Nigerian Naira'        },
  { code: 'KES', label: 'KES — Kenyan Shilling'       },
  { code: 'ZAR', label: 'ZAR — South African Rand'    },
  { code: 'CAD', label: 'CAD — Canadian Dollar'       },
];

export const CENTRE_ICONS = ['🏠', '✈️', '🏢', '🏪', '🌍', '💼', '🏡', '🏗️'];
export const INCOME_ICONS  = ['💰', '💵', '🏠', '💼', '📈', '🎯', '🏪', '✈️'];

export const DEFAULT_CATEGORIES = [
  { name: 'Rent / Mortgage', icon: '🏠', budget_amount: 0, is_fixed: true,  sort_order: 0  },
  { name: 'Electricity',     icon: '⚡', budget_amount: 0, is_fixed: true,  sort_order: 1  },
  { name: 'Water',           icon: '💧', budget_amount: 0, is_fixed: true,  sort_order: 2  },
  { name: 'Internet',        icon: '📡', budget_amount: 0, is_fixed: true,  sort_order: 3  },
  { name: 'Groceries',       icon: '🛒', budget_amount: 0, is_fixed: true,  sort_order: 4  },
  { name: 'Transport',       icon: '🚗', budget_amount: 0, is_fixed: true,  sort_order: 5  },
  { name: 'School Fees',     icon: '📚', budget_amount: 0, is_fixed: true,  sort_order: 6  },
  { name: 'Healthcare',      icon: '🏥', budget_amount: 0, is_fixed: true,  sort_order: 7  },
  { name: 'Kids Activities', icon: '🎨', budget_amount: 0, is_fixed: true,  sort_order: 8  },
  { name: 'Eating Out',      icon: '🍽️', budget_amount: 0, is_fixed: false, sort_order: 9  },
  { name: 'Entertainment',   icon: '🎬', budget_amount: 0, is_fixed: false, sort_order: 10 },
  { name: 'Clothing',        icon: '👗', budget_amount: 0, is_fixed: false, sort_order: 11 },
  { name: 'Personal Care',   icon: '💆', budget_amount: 0, is_fixed: false, sort_order: 12 },
];

/**
 * Factory function for a new empty income stream.
 * Always call this — never construct the object inline.
 * @param {string} centreCurrency — defaults new stream to centre currency
 * @returns {IncomeStream}
 */
export const emptyIncome = (centreCurrency) => ({
  id:              crypto.randomUUID(),
  label:           '',
  icon:            '💰',
  expected_amount: 0,
  currency:        centreCurrency,
  pay_day:         null,
  pay_day_type:    'flexible',
  notes:           '',
});
