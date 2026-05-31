/**
 * test-utils/contextMocks.js
 *
 * Stable mock factory helpers for BudgetCentreContext and FinanceContext.
 * Import these in vi.mock() factories to avoid recreating fn() on every render.
 *
 * Usage in a test file:
 *   import { makeBudgetCentreMock, makeFinanceMock } from '../../test-utils/contextMocks';
 *   vi.mock('../../context/BudgetCentreContext', () => makeBudgetCentreMock());
 */

import { vi } from 'vitest';
import {
  mockCentre, mockFmt, mockCategories, mockMembers, mockIncomes, mockTxs,
  mockWeeklyData, mockCategorySpend,
} from './fixtures';

export function makeBudgetCentreMock(overrides = {}) {
  return {
    useBudgetCentreContext: () => ({
      centre:            mockCentre,
      fmt:               mockFmt,
      categories:        mockCategories,
      members:           mockMembers,
      currentMemberRole: 'owner',
      can:               vi.fn().mockReturnValue(true),
      getCatIcon:        vi.fn((name) => name === 'Groceries' ? '🛒' : '💸'),
      addCategory:       vi.fn().mockResolvedValue({ error: null }),
      updateCentre:      vi.fn().mockResolvedValue({ error: null }),
      updateCategory:    vi.fn().mockResolvedValue({ error: null }),
      deleteCategory:    vi.fn().mockResolvedValue({ error: null }),
      inviteMember:      vi.fn().mockResolvedValue({ data: { token: 'tok' }, error: null }),
      removeMember:      vi.fn().mockResolvedValue({ error: null }),
      updateMemberRole:  vi.fn().mockResolvedValue({ error: null }),
      getInvites:        vi.fn().mockResolvedValue({ data: [], error: null }),
      cancelInvite:      vi.fn().mockResolvedValue({ error: null }),
      ...overrides,
    }),
  };
}

export function makeFinanceMock(overrides = {}) {
  return {
    useFinanceContext: () => ({
      loading:              false,
      error:                null,
      txs:                  mockTxs,
      incomes:              mockIncomes,
      totalReceived:        30000,
      totalExpected:        45000,
      totalPending:         15000,
      totalSpent:           5000,
      allIncome:            45000,
      monthlyIncome:        45000,
      healthPct:            89,
      budgetStatus:         { label: 'On Track 🎯', color: '#059669' },
      nextUnpaid:           { id: 'inc-2', label: 'Dita Salary', expected_amount: 15000, daysUntil: 7 },
      fixedTotal:           28000,
      budgetRemaining:      23000,
      surplusTarget:        4500,
      spareMoney:           19600,
      activeMonth:          '2026-05',
      weeklyData:           mockWeeklyData,
      categorySpend:        mockCategorySpend,
      prefs:                { themeSkin: 'family_warmth' },
      userPlan:             'free',
      loadMonth:            vi.fn(),
      addTransaction:       vi.fn().mockResolvedValue({ error: null }),
      updateTransaction:    vi.fn().mockResolvedValue({ error: null }),
      deleteTransaction:    vi.fn().mockResolvedValue({ error: null }),
      markReceived:         vi.fn().mockResolvedValue({ error: null }),
      markPending:          vi.fn().mockResolvedValue({ error: null }),
      updateExpectedAmount: vi.fn().mockResolvedValue({ error: null }),
      updateIncomeSource:   vi.fn().mockResolvedValue({ error: null }),
      addIncomeSource:      vi.fn().mockResolvedValue({ error: null }),
      deleteIncomeSource:   vi.fn().mockResolvedValue({ error: null }),
      saveThemeSkin:        vi.fn(),
      ...overrides,
    }),
  };
}
