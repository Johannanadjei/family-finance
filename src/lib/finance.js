/**
 * lib/finance.js — Pure calculation functions.
 *
 * ARCHITECTURE:
 * - No imports from mockData, constants, or any user-specific data
 * - All functions that need categories accept them as a parameter
 * - Currency formatting is created per-household via makeFmt()
 * - Supabase is the only source of truth for all inputs to these functions
 *
 * Category shape (from Supabase):
 *   { id, name, icon, budget_amount, is_fixed, sort_order }
 */

import { WEEKS } from '../constants';

// ── Currency ──────────────────────────────────────────────────────────────────

const CURRENCY_CONFIG = {
  GHS: { symbol: 'GHS', locale: 'en-GH' },
  USD: { symbol: '$',   locale: 'en-US' },
  GBP: { symbol: '£',   locale: 'en-GB' },
  EUR: { symbol: '€',   locale: 'de-DE' },
  NGN: { symbol: '₦',   locale: 'en-NG' },
  KES: { symbol: 'KSh', locale: 'en-KE' },
  ZAR: { symbol: 'R',   locale: 'en-ZA' },
  CAD: { symbol: 'CA$', locale: 'en-CA' },
  GBP: { symbol: '£',   locale: 'en-GB' },
};

/**
 * Create a currency-aware formatter for a household.
 * Call once when the household loads — not on every render.
 *
 * @param {string} currency — e.g. 'GHS', 'USD', 'GBP'
 * @returns {(n: number) => string}
 *
 * @example
 * const fmt = makeFmt('GHS')
 * fmt(1200) // → 'GHS 1,200'
 *
 * const fmt = makeFmt('USD')
 * fmt(1200) // → '$1,200'
 */
export const makeFmt = (currency = 'GHS') => {
  const config = CURRENCY_CONFIG[currency] || CURRENCY_CONFIG.GHS;
  return (n) => config.symbol + ' ' + Math.round(n || 0).toLocaleString(config.locale);
};

/**
 * Fallback formatter — used only before household loads.
 * Components should use makeFmt(household.currency) via HouseholdContext.
 */
export const fmt = makeFmt('GHS');

// ── Date formatting ───────────────────────────────────────────────────────────

/** Format a date string to a short readable label */
export const fmtDate = (d) =>
  new Date(d).toLocaleDateString('en-GH', { day: 'numeric', month: 'short' });

/** Format a date as a day header (Today / Yesterday / weekday) */
export const fmtDayHeader = (dateStr) => {
  const today     = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (dateStr === today)     return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GH', {
    weekday: 'long', day: 'numeric', month: 'short',
  });
};

/** Derive week label from a date string ('YYYY-MM-DD') */
export const getWeekForDate = (dateStr) => {
  const day = new Date(dateStr).getDate();
  if (day <= 7)  return 'Week 1';
  if (day <= 14) return 'Week 2';
  if (day <= 21) return 'Week 3';
  if (day <= 28) return 'Week 4';
  return 'Week 5';
};

// ── Core transaction calculations ─────────────────────────────────────────────

/** Total income from all Income transactions */
export const calcTotalIncome = (txs) =>
  txs.filter(t => t.type === 'Income').reduce((s, t) => s + t.amount, 0);

/** Total spent from all Expense transactions */
export const calcTotalSpent = (txs) =>
  txs.filter(t => t.type === 'Expense').reduce((s, t) => s + t.amount, 0);

/** Remaining = monthlyIncome - totalSpent */
export const calcRemaining = (monthlyIncome, totalSpent) =>
  monthlyIncome - totalSpent;

/** Budget health as a percentage (0–100) */
export const calcHealthPct = (remaining, monthlyIncome) =>
  monthlyIncome > 0
    ? Math.max(0, Math.min(100, Math.round((remaining / monthlyIncome) * 100)))
    : 0;

/**
 * Budget status — returns { label, color }
 * surplusTarget comes from household.surplus_target (Supabase)
 */
export const getBudgetStatus = (remaining, surplusTarget) => {
  if (remaining > surplusTarget) return { label: 'On Track 🎯',   color: '#059669' };
  if (remaining > 0)             return { label: 'Watch Out ⚠️',  color: '#d97706' };
  return                                { label: 'Over Budget 🚨', color: '#dc2626' };
};

/** Spending per day — returns { 'YYYY-MM-DD': amount } */
export const calcSpendByDay = (txs) => {
  const m = {};
  txs.filter(t => t.type === 'Expense').forEach(t => {
    m[t.date] = (m[t.date] || 0) + t.amount;
  });
  return m;
};

// ── Category-aware calculations ───────────────────────────────────────────────
// All accept `categories` from Supabase — shape: { name, icon, budget_amount }
// No fallback to FIXED_EXPENSES. Supabase is the only source.

/** Normalise a category name for reliable matching */
const norm = (name) => (name || '').trim().toLowerCase();

/**
 * Total fixed budget — sum of all household category budgets.
 * @param {Array} categories — from Supabase budget_categories
 */
export const calcTotalFixed = (categories = []) =>
  categories.reduce((s, c) => s + (c.budget_amount || 0), 0);

/**
 * Spending per category — returns { categoryName: amount }
 * Initialises all known categories to 0 so the UI always has a value.
 * @param {Array} txs
 * @param {Array} categories — from Supabase budget_categories
 */
export const calcCategorySpend = (txs, categories = []) => {
  const map = {};
  categories.forEach(c => { map[c.name] = 0; });
  txs
    .filter(t => t.type === 'Expense')
    .forEach(t => { map[t.category] = (map[t.category] || 0) + t.amount; });
  return map;
};

/**
 * Weekly monitor data for all 5 weeks.
 * @param {Array} txs
 * @param {Array} categories — from Supabase
 * @param {number} monthlyIncome — from household.monthly_income (Supabase)
 */
export const calcWeeklyData = (txs, categories = [], monthlyIncome = 0) => {
  const totalFixed  = calcTotalFixed(categories);
  const weeklyFixed = Math.round(totalFixed / 5);
  const weeklyIncome = Math.round(monthlyIncome / 5);

  return WEEKS.map(week => {
    const income   = txs.filter(t => t.week === week && t.type === 'Income').reduce((s, t) => s + t.amount, 0);
    const variable = txs.filter(t => t.week === week && t.type === 'Expense').reduce((s, t) => s + t.amount, 0);
    return {
      week,
      plannedIncome:    weeklyIncome,
      actualIncome:     income,
      fixedExpenses:    weeklyFixed,
      variableSpending: variable,
      net:              income - weeklyFixed - variable,
    };
  });
};

/**
 * Check if a category name matches any of the household's budget categories.
 * @param {string} categoryName
 * @param {Array} categories — from Supabase
 */
export const isKnownCategory = (categoryName, categories = []) =>
  categories.some(c => norm(c.name) === norm(categoryName));

/**
 * Get the icon for a category by name.
 * @param {string} categoryName
 * @param {Array} categories — from Supabase
 */
export const getCategoryIcon = (categoryName, categories = []) => {
  const match = categories.find(c => norm(c.name) === norm(categoryName));
  return match?.icon || '💸';
};

/**
 * Calculate total spent on known budget categories only.
 * @param {Array} txs
 * @param {Array} categories — from Supabase
 */
export const calcFixedSpent = (txs, categories = []) =>
  txs
    .filter(t => t.type === 'Expense' && isKnownCategory(t.category, categories))
    .reduce((s, t) => s + t.amount, 0);

/**
 * Calculate variable spending — expenses NOT in any known budget category.
 * @param {Array} txs
 * @param {Array} categories — from Supabase
 */
export const calcVariableSpent = (txs, categories = []) =>
  txs
    .filter(t => t.type === 'Expense' && !isKnownCategory(t.category, categories))
    .reduce((s, t) => s + t.amount, 0);

/**
 * Calculate surplus left:
 *   monthlyIncome - totalBudgeted - variableSpent
 */
export const calcSurplusLeft = (monthlyIncome, totalBudgeted, variableSpent) =>
  monthlyIncome - totalBudgeted - variableSpent;

// ── Payday calculations ────────────────────────────────────────────────────────

/** Total expected income across all income sources */
export const calcTotalExpected = (incomes) =>
  incomes.reduce((s, i) => s + (i.expectedAmount || 0), 0);

/** Total income received so far this month */
export const calcTotalReceived = (incomes) =>
  incomes.reduce((s, i) => s + (i.receivedAmount || 0), 0);

/** Available right now = received income minus expenses this calendar month */
export const calcAvailableNow = (incomes, txs) => {
  const today    = new Date();
  const received = calcTotalReceived(incomes);
  const spent    = txs
    .filter(t => {
      const d = new Date(t.date);
      return t.type === 'Expense'
        && d.getMonth()    === today.getMonth()
        && d.getFullYear() === today.getFullYear();
    })
    .reduce((s, t) => s + t.amount, 0);
  return received - spent;
};

/** Days until the next occurrence of a day-of-month */
export const calcDaysUntil = (dayOfMonth) => {
  if (!dayOfMonth) return null;
  const today  = new Date();
  const target = new Date(today.getFullYear(), today.getMonth(), dayOfMonth);
  if (target < today) target.setMonth(target.getMonth() + 1);
  return Math.ceil((target - today) / 86400000);
};

/** Human-readable next pay date string */
export const fmtNextPayDate = (income) => {
  if (income.payDayType === 'last_working') return 'Last working day';
  if (!income.expectedPayDay)              return 'Flexible';
  const today  = new Date();
  const target = new Date(today.getFullYear(), today.getMonth(), income.expectedPayDay);
  if (target < today) target.setMonth(target.getMonth() + 1);
  return target.toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** Status label for an income source */
export const getIncomeStatus = (income) => {
  if (income.received) return 'received';
  const days = calcDaysUntil(income.expectedPayDay);
  if (days === null) return 'flexible';
  if (days === 0)    return 'today';
  if (days <= 3)     return 'soon';
  return 'upcoming';
};

export const INCOME_STATUS_CONFIG = {
  received: { label: 'Received ✓',  bg: '#d1fae5', color: '#065f46', border: '#6ee7b7' },
  today:    { label: 'Today! 🎉',   bg: '#fef3c7', color: '#92400e', border: '#f59e0b' },
  soon:     { label: 'Coming soon', bg: '#ffe4e6', color: '#9f1239', border: '#fda4af' },
  upcoming: { label: 'Upcoming',    bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' },
  flexible: { label: 'Flexible',    bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' },
};

// ── Analytics ─────────────────────────────────────────────────────────────────

/** Weekly summary for a given week filter ('All' or 'Week N') */
export const calcWeekSummary = (txs, week) => {
  const scoped   = week === 'All' ? txs : txs.filter(t => t.week === week);
  const expenses = scoped.filter(t => t.type === 'Expense').reduce((s, t) => s + t.amount, 0);
  const income   = scoped.filter(t => t.type === 'Income').reduce((s, t) => s + t.amount, 0);
  return { expenses, income, net: income - expenses, count: scoped.length };
};

/** Top spending categories with percentage of total */
export const calcTopCategories = (txs, limit = 5) => {
  const expenses = txs.filter(t => t.type === 'Expense');
  const total    = expenses.reduce((s, t) => s + t.amount, 0);
  if (total === 0) return [];
  const map = {};
  expenses.forEach(t => { map[t.category] = (map[t.category] || 0) + t.amount; });
  return Object.entries(map)
    .map(([category, amount]) => ({ category, amount, pct: Math.round((amount / total) * 100) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
};

// ── Sync stubs ────────────────────────────────────────────────────────────────

/** MVP stub — replace with Supabase real-time in Phase 2 */
export const syncGuestExpenseToBackend = async (transaction) => {
  console.debug('[syncGuestExpenseToBackend] MVP stub:', transaction.id);
};

/** MVP stub — replace with Google Sheets API in Phase 3 */
export const syncExpectedIncomeToSpreadsheet = async (incomeId, newAmount) => {
  console.debug('[syncExpectedIncomeToSpreadsheet] MVP stub:', incomeId, newAmount);
};
