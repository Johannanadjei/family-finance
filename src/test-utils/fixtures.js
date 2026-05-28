/**
 * test-utils/fixtures.js
 *
 * Shared test fixtures used across component tests.
 * Centralises test data — change once, affects all tests.
 * Never imported in production code.
 */

export const mockCentre = {
  id:             'c1',
  name:           "The Adjei's",
  icon:           '🏠',
  currency:       'GHS',
  surplus_target: 4500,
  owner_id:       'user-1',
};

export const mockFmt = (n) => `GHS ${Math.round(n || 0).toLocaleString()}`;

export const mockCategories = [
  { id: 'cat-1', name: 'Groceries', icon: '🛒', budget_amount: 500, is_fixed: true,  sort_order: 0 },
  { id: 'cat-2', name: 'Transport', icon: '🚗', budget_amount: 200, is_fixed: true,  sort_order: 1 },
];

export const mockMembers = [
  { id: 'mem-1', user_id: 'user-1', role: 'owner',    joined_at: '2026-01-01T00:00:00Z', users: { name: 'Johannan', email: 'johannan@test.com' } },
  { id: 'mem-2', user_id: 'user-2', role: 'standard', joined_at: '2026-02-15T00:00:00Z', users: { name: 'Dita',     email: 'dita@test.com' } },
];

export const mockIncomes = [
  { id: 'inc-1', label: 'Adjei Salary', expected_amount: 30000, received: true,  received_amount: 30000, currency: 'GHS', pay_day: 31, pay_day_type: 'last_working_day' },
  { id: 'inc-2', label: 'Dita Salary',  expected_amount: 15000, received: false, received_amount: 0,     currency: 'GHS', pay_day: 25, pay_day_type: 'fixed_date'       },
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
