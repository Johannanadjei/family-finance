/**
 * lib/hubTypes.js
 *
 * Hub (Control Centre) type definitions and their default category presets.
 * Pure data — no React, no side effects, no async.
 *
 * Hub type drives:
 *   - the skin suggested when creating a new hub
 *   - the category presets shown in onboarding / CreateHubSheet
 */

export const HUB_TYPES = [
  {
    id:          'family_home',
    label:       'Family Home',
    icon:        '🏠',
    defaultSkin: 'family_warmth',
    description: 'Household budgets, bills, and family spending',
  },
  {
    id:          'rental',
    label:       'Rental Property',
    icon:        '✈️',
    defaultSkin: 'international',
    description: 'Income and expenses for a rental or Airbnb property',
  },
  {
    id:          'business',
    label:       'Business',
    icon:        '🏪',
    defaultSkin: 'corporate',
    description: 'Revenue, costs, and cash flow for a small business',
  },
  {
    id:          'personal',
    label:       'Personal',
    icon:        '💼',
    defaultSkin: 'minimalist',
    description: 'Your own income, savings, and personal expenses',
  },
];

/** @param {string} id */
export const getHubType = (id) => HUB_TYPES.find(h => h.id === id);

// ── Category presets ──────────────────────────────────────────────────────────

const FAMILY_HOME_CATEGORIES = [
  { name: 'Rent / Mortgage', icon: '🏠', budget_amount: 0, is_fixed: true,  sort_order: 0  },
  { name: 'Electricity',     icon: '⚡', budget_amount: 0, is_fixed: true,  sort_order: 1  },
  { name: 'Water',           icon: '💧', budget_amount: 0, is_fixed: true,  sort_order: 2  },
  { name: 'Internet',        icon: '📡', budget_amount: 0, is_fixed: true,  sort_order: 3  },
  { name: 'Groceries',       icon: '🛒', budget_amount: 0, is_fixed: true,  sort_order: 4  },
  { name: 'Transport',       icon: '🚗', budget_amount: 0, is_fixed: true,  sort_order: 5  },
  { name: 'School Fees',     icon: '📚', budget_amount: 0, is_fixed: true,  sort_order: 6  },
  { name: 'Healthcare',      icon: '🏥', budget_amount: 0, is_fixed: true,  sort_order: 7  },
  { name: 'Kids Activities', icon: '🎨', budget_amount: 0, is_fixed: false, sort_order: 8  },
  { name: 'Eating Out',      icon: '🍽️', budget_amount: 0, is_fixed: false, sort_order: 9  },
  { name: 'Entertainment',   icon: '🎬', budget_amount: 0, is_fixed: false, sort_order: 10 },
  { name: 'Clothing',        icon: '👗', budget_amount: 0, is_fixed: false, sort_order: 11 },
  { name: 'Personal Care',   icon: '💆', budget_amount: 0, is_fixed: false, sort_order: 12 },
];

const RENTAL_CATEGORIES = [
  { name: 'Mortgage / Bond',  icon: '🏠', budget_amount: 0, is_fixed: true,  sort_order: 0 },
  { name: 'Insurance',        icon: '🛡️', budget_amount: 0, is_fixed: true,  sort_order: 1 },
  { name: 'Electricity',      icon: '⚡', budget_amount: 0, is_fixed: true,  sort_order: 2 },
  { name: 'Water',            icon: '💧', budget_amount: 0, is_fixed: true,  sort_order: 3 },
  { name: 'Internet / WiFi',  icon: '📡', budget_amount: 0, is_fixed: true,  sort_order: 4 },
  { name: 'Cleaning',         icon: '🧹', budget_amount: 0, is_fixed: true,  sort_order: 5 },
  { name: 'Maintenance',      icon: '🔧', budget_amount: 0, is_fixed: false, sort_order: 6 },
  { name: 'Management Fees',  icon: '📋', budget_amount: 0, is_fixed: false, sort_order: 7 },
  { name: 'Furnishings',      icon: '🛋️', budget_amount: 0, is_fixed: false, sort_order: 8 },
  { name: 'Platform Fees',    icon: '📱', budget_amount: 0, is_fixed: false, sort_order: 9 },
];

const BUSINESS_CATEGORIES = [
  { name: 'Rent / Lease',   icon: '🏢', budget_amount: 0, is_fixed: true,  sort_order: 0 },
  { name: 'Staff Wages',    icon: '👥', budget_amount: 0, is_fixed: true,  sort_order: 1 },
  { name: 'Electricity',    icon: '⚡', budget_amount: 0, is_fixed: true,  sort_order: 2 },
  { name: 'Internet',       icon: '📡', budget_amount: 0, is_fixed: true,  sort_order: 3 },
  { name: 'Inventory',      icon: '📦', budget_amount: 0, is_fixed: false, sort_order: 4 },
  { name: 'Transport',      icon: '🚗', budget_amount: 0, is_fixed: false, sort_order: 5 },
  { name: 'Marketing',      icon: '📣', budget_amount: 0, is_fixed: false, sort_order: 6 },
  { name: 'Equipment',      icon: '🔧', budget_amount: 0, is_fixed: false, sort_order: 7 },
  { name: 'Miscellaneous',  icon: '📌', budget_amount: 0, is_fixed: false, sort_order: 8 },
];

const PERSONAL_CATEGORIES = [
  { name: 'Rent',          icon: '🏠', budget_amount: 0, is_fixed: true,  sort_order: 0  },
  { name: 'Groceries',     icon: '🛒', budget_amount: 0, is_fixed: true,  sort_order: 1  },
  { name: 'Transport',     icon: '🚗', budget_amount: 0, is_fixed: true,  sort_order: 2  },
  { name: 'Subscriptions', icon: '📱', budget_amount: 0, is_fixed: true,  sort_order: 3  },
  { name: 'Healthcare',    icon: '🏥', budget_amount: 0, is_fixed: true,  sort_order: 4  },
  { name: 'Savings',       icon: '💰', budget_amount: 0, is_fixed: true,  sort_order: 5  },
  { name: 'Dining Out',    icon: '🍽️', budget_amount: 0, is_fixed: false, sort_order: 6  },
  { name: 'Entertainment', icon: '🎬', budget_amount: 0, is_fixed: false, sort_order: 7  },
  { name: 'Clothing',      icon: '👗', budget_amount: 0, is_fixed: false, sort_order: 8  },
  { name: 'Personal Care', icon: '💆', budget_amount: 0, is_fixed: false, sort_order: 9  },
];

const PRESETS = {
  family_home: FAMILY_HOME_CATEGORIES,
  rental:      RENTAL_CATEGORIES,
  business:    BUSINESS_CATEGORIES,
  personal:    PERSONAL_CATEGORIES,
};

/**
 * Returns a fresh copy of the default categories for a hub type.
 * Falls back to family_home categories for unknown types.
 * @param {string} hubTypeId
 * @returns {object[]}
 */
export const getDefaultCategories = (hubTypeId) =>
  (PRESETS[hubTypeId] || PRESETS.family_home).map(c => ({ ...c }));
