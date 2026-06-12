/**
 * test-utils/fixtures.js
 *
 * Shared test fixtures used across component tests.
 * Centralises test data — change once, affects all tests.
 * Never imported in production code.
 */

import { getCurrentMonth } from '../lib/dates';
import { offsetMonth }     from '../lib/finance';

// Income sources + budget categories are month-scoped (Phase 2A/2C). Fixtures use
// the *current* month so views that show "this month's" data render them
// regardless of run date; LAST_MONTH backs rollforward (Phase 2B/2C) fixtures.
const THIS_MONTH = getCurrentMonth();
const LAST_MONTH = offsetMonth(THIS_MONTH, -1);

export const mockCentre = {
  id:                'c1',
  name:              "The Adjei's",
  icon:              '🏠',
  currency:          'GHS',
  surplus_target:    4500,
  owner_id:          'user-1',
};

export const mockFmt = (n) => `GHS ${Math.round(n || 0).toLocaleString()}`;

// cycle_id mirrors the Commit-10 trigger (stamped from month); the slice layer keys
// on it (Commit 11.5). cyc-this / cyc-last reference mockCycles below.
export const mockCategories = [
  { id: 'cat-1', name: 'Groceries', icon: '🛒', budget_amount: 500, is_fixed: true,  sort_order: 0, month: THIS_MONTH, cycle_id: 'cyc-this' },
  { id: 'cat-2', name: 'Transport', icon: '🚗', budget_amount: 200, is_fixed: true,  sort_order: 1, month: THIS_MONTH, cycle_id: 'cyc-this' },
];

// Previous month's categories — drives the Phase 2C budget-rollforward prompt.
export const mockPrevMonthCategories = [
  { id: 'pcat-1', name: 'Groceries', icon: '🛒', budget_amount: 500, is_fixed: true, sort_order: 0, month: LAST_MONTH, cycle_id: 'cyc-last' },
  { id: 'pcat-2', name: 'Transport', icon: '🚗', budget_amount: 200, is_fixed: true, sort_order: 1, month: LAST_MONTH, cycle_id: 'cyc-last' },
  { id: 'pcat-3', name: 'Fun',       icon: '🎉', budget_amount: 150, is_fixed: false, sort_order: 2, month: LAST_MONTH, cycle_id: 'cyc-last' },
];

// All-months categories (Phase 2D) — spans THIS_MONTH + LAST_MONTH so tests can
// assert the current-cycle slice vs the full all-months array. Month-desc then
// sort_order-asc, matching getAllCategories' ordering.
export const mockAllCategories = [
  { id: 'cat-1',  name: 'Groceries', icon: '🛒', budget_amount: 500, is_fixed: true,  sort_order: 0, month: THIS_MONTH, cycle_id: 'cyc-this' },
  { id: 'cat-2',  name: 'Transport', icon: '🚗', budget_amount: 200, is_fixed: true,  sort_order: 1, month: THIS_MONTH, cycle_id: 'cyc-this' },
  { id: 'acat-3', name: 'Groceries', icon: '🛒', budget_amount: 480, is_fixed: true,  sort_order: 0, month: LAST_MONTH, cycle_id: 'cyc-last' },
  { id: 'acat-4', name: 'Holiday',   icon: '✈️', budget_amount: 300, is_fixed: false, sort_order: 1, month: LAST_MONTH, cycle_id: 'cyc-last' },
];

export const mockMembers = [
  { id: 'mem-1', user_id: 'user-1', role: 'owner',    joined_at: '2026-01-01T00:00:00Z', users: { name: 'Johannan', email: 'johannan@test.com' } },
  { id: 'mem-2', user_id: 'user-2', role: 'standard', joined_at: '2026-02-15T00:00:00Z', users: { name: 'Dita',     email: 'dita@test.com' } },
];

// Budget cycles (Commit 4+). THIS_CYCLE contains today (string-compared ISO dates
// with a '-31' upper bound, matching getActiveCycle's containment test); LAST_CYCLE
// backs cross-cycle fixtures. cycle_id on the rows below references these ids — the
// storage-layer invariant (Commit 10 trigger) means every live row carries one.
export const mockCycles = [
  { id: 'cyc-this', budget_centre_id: 'c1', name: 'This Cycle', start_date: THIS_MONTH + '-01', end_date: THIS_MONTH + '-31', anchor_type: 'calendar', deleted_at: null },
  { id: 'cyc-last', budget_centre_id: 'c1', name: 'Last Cycle', start_date: LAST_MONTH + '-01', end_date: LAST_MONTH + '-31', anchor_type: 'calendar', deleted_at: null },
];

export const mockIncomes = [
  { id: 'inc-1', label: 'Adjei Salary', expected_amount: 30000, received: true,  received_amount: 30000, currency: 'GHS', pay_day: 31, pay_day_type: 'last_working_day', month: THIS_MONTH, cycle_id: 'cyc-this' },
  { id: 'inc-2', label: 'Dita Salary',  expected_amount: 15000, received: false, received_amount: 0,     currency: 'GHS', pay_day: 25, pay_day_type: 'fixed_date',       month: THIS_MONTH, cycle_id: 'cyc-this' },
];

export const mockTxs = [
  {
    id:                  'tx-1',
    type:                'expense',
    amount:              200,
    category_name:       'Groceries',
    date:                '2026-05-19',
    week:                'Week 3',
    currency:            'GHS',
    source:              'main_app',
    logged_by_name:      'Johannan',
    logged_by_user_id:   'user-1',
    description:         'Weekly shop',
    cycle_id:            'cyc-this',
    _optimistic:         false,
  },
  {
    id:              'tx-2',
    type:            'income',
    amount:          30000,
    category_name:   'Adjei Salary',
    date:            '2026-05-19',
    week:            'Week 3',
    currency:        'GHS',
    source:          'main_app',
    logged_by_name:  'Johannan',
    description:     '',
    cycle_id:        'cyc-this',
    _optimistic:     false,
  },
];

export const mockWeeklyData = [
  { week: 'Week 1', plannedIncome: 9000, actualIncome: 0,     fixedExpenses: 5080, variableSpending: 0,   net: -5080 },
  { week: 'Week 2', plannedIncome: 9000, actualIncome: 0,     fixedExpenses: 5080, variableSpending: 0,   net: -5080 },
  { week: 'Week 3', plannedIncome: 9000, actualIncome: 30000, fixedExpenses: 5080, variableSpending: 200, net: 24720 },
  { week: 'Week 4', plannedIncome: 9000, actualIncome: 0,     fixedExpenses: 5080, variableSpending: 0,   net: -5080 },
  { week: 'Week 5', plannedIncome: 9000, actualIncome: 0,     fixedExpenses: 5080, variableSpending: 0,   net: -5080 },
];

export const mockCategorySpend = {
  'Groceries': 200,
  'Transport': 0,
};

export const mockGuests = [
  { id: 'guest-1', name: 'Sarah', budget_centre_id: 'c1', allowed_categories: ['Groceries', 'Transport'], is_active: true,  created_at: '2026-01-01T00:00:00Z' },
  { id: 'guest-2', name: 'Tom',   budget_centre_id: 'c1', allowed_categories: ['Groceries'],               is_active: false, created_at: '2026-01-02T00:00:00Z' },
];

// Subscription CONTEXT values (shape of useSubscriptionContext() return) — Pro pricing.
// Free has no row (subscription: null → resolver treats as free). Tests spread these and
// add a fresh `refresh: vi.fn()` per case. The far-future period end keeps Pro "open".
export const mockSubscriptionFree = {
  subscription: null,
  tier:         'free',
  isActive:     false,
  isPro:        false,
  isLoading:    false,
  error:        null,
};

export const mockSubscriptionPro = {
  subscription: { id: 'sub-1', user_id: 'user-1', tier: 'pro', status: 'active', current_period_end: '2999-01-01T00:00:00Z' },
  tier:         'pro',
  isActive:     true,
  isPro:        true,
  isLoading:    false,
  error:        null,
};
