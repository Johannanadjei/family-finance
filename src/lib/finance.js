import { FIXED_EXPENSES, WEEKS } from '../constants';

/** Format a number as GHS currency */
export const fmt = (n) => 'GHS ' + Math.round(n || 0).toLocaleString('en-GH');

/** Total income from all Income transactions */
export const calcTotalIncome = (txs) =>
  txs.filter(t => t.type === 'Income').reduce((s, t) => s + t.amount, 0);

/** Total spent from all Expense transactions */
export const calcTotalSpent = (txs) =>
  txs.filter(t => t.type === 'Expense').reduce((s, t) => s + t.amount, 0);

/** Remaining monthly budget */
export const calcRemaining = (monthlyIncome, totalSpent) =>
  monthlyIncome - totalSpent;

/** Budget health as a percentage (0–100) */
export const calcHealthPct = (remaining, monthlyIncome) =>
  monthlyIncome > 0 ? Math.max(0, Math.min(100, Math.round((remaining / monthlyIncome) * 100))) : 0;

/** Spending per category — returns { categoryName: amount } */
export const calcCategorySpend = (txs) => {
  const map = {};
  FIXED_EXPENSES.forEach(e => { map[e.category] = 0; });
  txs
    .filter(t => t.type === 'Expense')
    .forEach(t => { map[t.category] = (map[t.category] || 0) + t.amount; });
  return map;
};

/** Weekly monitor data for all 5 weeks */
export const calcWeeklyData = (txs) => {
  const totalFixed = FIXED_EXPENSES.reduce((s, e) => s + e.budget, 0);
  const weeklyFixed = Math.round(totalFixed / 5);

  return WEEKS.map(week => {
    const income   = txs.filter(t => t.week === week && t.type === 'Income').reduce((s,t) => s+t.amount, 0);
    const variable = txs.filter(t => t.week === week && t.type === 'Expense').reduce((s,t) => s+t.amount, 0);
    return {
      week,
      plannedIncome:    9000,
      actualIncome:     income,
      fixedExpenses:    weeklyFixed,
      variableSpending: variable,
      net:              income - weeklyFixed - variable,
    };
  });
};

/** Spending per day — returns { 'YYYY-MM-DD': amount } */
export const calcSpendByDay = (txs) => {
  const m = {};
  txs.filter(t => t.type === 'Expense').forEach(t => {
    m[t.date] = (m[t.date] || 0) + t.amount;
  });
  return m;
};

/** Total fixed budget */
export const calcTotalFixed = () =>
  FIXED_EXPENSES.reduce((s, e) => s + e.budget, 0);

/** Budget status label */
export const getBudgetStatus = (remaining, surplusTarget) => {
  if (remaining > surplusTarget) return { label: 'On Track 🎯', color: '#059669' };
  if (remaining > 0)             return { label: 'Watch Out ⚠️', color: '#d97706' };
  return                                { label: 'Over Budget 🚨', color: '#dc2626' };
};

/** Format a date string to a short readable label */
export const fmtDate = (d) =>
  new Date(d).toLocaleDateString('en-GH', { day: 'numeric', month: 'short' });

/** Format a date as a day header (Today / Yesterday / full date) */
export const fmtDayHeader = (dateStr) => {
  const today     = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (dateStr === today)     return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GH', {
    weekday: 'long', day: 'numeric', month: 'short',
  });
};

// ─── Payday calculations ───────────────────────────────────────────────────

/** Total expected income across all sources */
export const calcTotalExpected = (incomes) =>
  incomes.reduce((s, i) => s + (i.expectedAmount || 0), 0);

/** Total income received so far */
export const calcTotalReceived = (incomes) =>
  incomes.reduce((s, i) => s + (i.receivedAmount || 0), 0);

/** Amount available right now: received minus expenses this calendar month */
export const calcAvailableNow = (incomes, txs) => {
  const today = new Date();
  const received = calcTotalReceived(incomes);
  const spent = txs
    .filter(t => {
      const d = new Date(t.date);
      return t.type === 'Expense'
        && d.getMonth()    === today.getMonth()
        && d.getFullYear() === today.getFullYear();
    })
    .reduce((s, t) => s + t.amount, 0);
  return received - spent;
};

/** Days until the next occurrence of a day-of-month (always >= 0) */
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
  received: { label: 'Received ✓', bg: '#d1fae5', color: '#065f46', border: '#6ee7b7' },
  today:    { label: 'Today! 🎉',  bg: '#fef3c7', color: '#92400e', border: '#f59e0b' },
  soon:     { label: 'Coming soon',bg: '#ffe4e6', color: '#9f1239', border: '#fda4af' },
  upcoming: { label: 'Upcoming',   bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' },
  flexible: { label: 'Flexible',   bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' },
};

// ─── Formalised calculation functions (per engineering spec) ──────────────

/** Set of fixed budget category names for fast lookup */
const FIXED_CATEGORY_NAMES = new Set(
  FIXED_EXPENSES.map(e => e.category.trim().toLowerCase())
);

/** Normalise a category name for reliable matching */
const normCat = (name) => (name || '').trim().toLowerCase();

/** Check if a category matches a fixed budget category */
export const isFixedCategory = (categoryName) =>
  FIXED_CATEGORY_NAMES.has(normCat(categoryName));

/**
 * Calculate total spent on fixed budget categories only.
 * Used for budget screen category cards.
 */
export const calcFixedSpent = (txs) =>
  txs
    .filter(t => t.type === 'Expense' && isFixedCategory(t.category))
    .reduce((s, t) => s + t.amount, 0);

/**
 * Calculate variable spending — expenses NOT in any fixed budget category.
 * Includes "Other", custom categories, and unrecognised guest categories.
 */
export const calcVariableSpent = (txs) =>
  txs
    .filter(t => t.type === 'Expense' && !isFixedCategory(t.category))
    .reduce((s, t) => s + t.amount, 0);

/**
 * Calculate how much has been spent on a specific category.
 * Uses normalised name matching so casing differences don't break it.
 */
export const calcCategorySpentByName = (categoryName, txs) =>
  txs
    .filter(t => t.type === 'Expense' && normCat(t.category) === normCat(categoryName))
    .reduce((s, t) => s + t.amount, 0);

/**
 * Calculate surplus left:
 *   monthlyIncome - fixedBudgetTotal - variableSpent
 * If positive, the family is under budget. If negative, overspent.
 */
export const calcSurplusLeft = (monthlyIncome, fixedBudgetTotal, variableSpent) =>
  monthlyIncome - fixedBudgetTotal - variableSpent;

/**
 * Placeholder — replace with real backend call in production.
 * FIREBASE SYNC POINT: await addDoc(collection(db, 'families', familyId, 'transactions'), tx);
 * SUPABASE SYNC POINT: await supabase.from('transactions').insert(tx);
 */
export const syncGuestExpenseToBackend = async (transaction) => {
  // MVP: no-op. Production: send to Firebase/Supabase.
  console.debug('[syncGuestExpenseToBackend] MVP stub called for:', transaction.id);
};

/** Weekly summary for a given week filter ('All' or 'Week N') */
export const calcWeekSummary = (txs, week) => {
  const scoped = week === 'All' ? txs : txs.filter(t => t.week === week);
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

/** GOOGLE SHEETS SYNC POINT: update expected income in spreadsheet */
export const syncExpectedIncomeToSpreadsheet = async (incomeId, newAmount) => {
  // TODO: implement Google Sheets API sync
  console.debug('[sync] syncExpectedIncomeToSpreadsheet', incomeId, newAmount);
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
