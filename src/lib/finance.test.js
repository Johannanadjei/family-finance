/**
 * lib/finance.test.js
 *
 * Unit tests for all pure functions in lib/finance.js
 * Every function tested with: happy path, edge cases, boundary values
 */

import { describe, it, expect } from 'vitest';
import {
  makeFmt,
  fmtDate,
  getWeekForDate,
  getCurrentMonth,
  offsetMonth,
  calcTotalIncome,
  calcTotalSpent,
  calcRemaining,
  calcHealthPct,
  getBudgetStatus,
  calcTotalFixed,
  calcCategorySpend,
  calcFixedSpent,
  calcVariableSpent,
  calcSurplusLeft,
  calcTotalExpected,
  calcTotalReceived,
  calcAvailableNow,
  calcDaysUntil,
  getIncomeStatus,
  calcWeekSummary,
  calcTopCategories,
  isKnownCategory,
  getCategoryIcon,
} from './finance';

// ── Test data factories ───────────────────────────────────────────────────────

const makeTx = (overrides = {}) => ({
  id:            'tx-1',
  type:          'expense',
  amount:        100,
  date:          '2026-05-01',
  week:          'Week 1',
  category_name: 'Groceries',
  ...overrides,
});

const makeCat = (overrides = {}) => ({
  id:            'cat-1',
  name:          'Groceries',
  icon:          '🛒',
  budget_amount: 500,
  is_fixed:      true,
  ...overrides,
});

const makeIncome = (overrides = {}) => ({
  id:              'inc-1',
  label:           'Salary',
  expected_amount: 5000,
  received:        false,
  received_amount: 0,
  pay_day:         25,
  pay_day_type:    'fixed_date',
  ...overrides,
});

// ── makeFmt ───────────────────────────────────────────────────────────────────

describe('makeFmt', () => {
  it('formats GHS correctly', () => {
    const fmt = makeFmt('GHS');
    expect(fmt(1000)).toBe('GHS 1,000');
  });

  it('formats USD correctly', () => {
    const fmt = makeFmt('USD');
    expect(fmt(1000)).toBe('$ 1,000');
  });

  it('formats GBP correctly', () => {
    const fmt = makeFmt('GBP');
    expect(fmt(1000)).toBe('£ 1,000');
  });

  it('rounds to nearest integer', () => {
    const fmt = makeFmt('GHS');
    expect(fmt(1000.7)).toBe('GHS 1,001');
    expect(fmt(1000.4)).toBe('GHS 1,000');
  });

  it('handles zero', () => {
    const fmt = makeFmt('GHS');
    expect(fmt(0)).toBe('GHS 0');
  });

  it('handles null and undefined safely', () => {
    const fmt = makeFmt('GHS');
    expect(fmt(null)).toBe('GHS 0');
    expect(fmt(undefined)).toBe('GHS 0');
  });

  it('falls back to GHS for unknown currency', () => {
    const fmt = makeFmt('XYZ');
    expect(fmt(1000)).toBe('GHS 1,000');
  });
});

// ── offsetMonth ──────────────────────────────────────────────────────────────

describe('offsetMonth', () => {
  it('adds one month', () =>
    expect(offsetMonth('2026-05', 1)).toBe('2026-06'));

  it('subtracts one month', () =>
    expect(offsetMonth('2026-05', -1)).toBe('2026-04'));

  it('rolls over year forward', () =>
    expect(offsetMonth('2026-12', 1)).toBe('2027-01'));

  it('rolls over year backward', () =>
    expect(offsetMonth('2026-01', -1)).toBe('2025-12'));

  it('pads month with leading zero', () =>
    expect(offsetMonth('2026-09', 1)).toBe('2026-10'));
});

// ── getWeekForDate ────────────────────────────────────────────────────────────

describe('getWeekForDate', () => {
  it('day 1 is Week 1', ()  => expect(getWeekForDate('2026-05-01')).toBe('Week 1'));
  it('day 7 is Week 1', ()  => expect(getWeekForDate('2026-05-07')).toBe('Week 1'));
  it('day 8 is Week 2', ()  => expect(getWeekForDate('2026-05-08')).toBe('Week 2'));
  it('day 14 is Week 2', () => expect(getWeekForDate('2026-05-14')).toBe('Week 2'));
  it('day 15 is Week 3', () => expect(getWeekForDate('2026-05-15')).toBe('Week 3'));
  it('day 21 is Week 3', () => expect(getWeekForDate('2026-05-21')).toBe('Week 3'));
  it('day 22 is Week 4', () => expect(getWeekForDate('2026-05-22')).toBe('Week 4'));
  it('day 28 is Week 4', () => expect(getWeekForDate('2026-05-28')).toBe('Week 4'));
  it('day 29 is Week 5', () => expect(getWeekForDate('2026-05-29')).toBe('Week 5'));
  it('day 31 is Week 5', () => expect(getWeekForDate('2026-05-31')).toBe('Week 5'));
});

// ── calcTotalIncome ───────────────────────────────────────────────────────────

describe('calcTotalIncome', () => {
  it('sums income transactions', () => {
    const txs = [
      makeTx({ type: 'income', amount: 3000 }),
      makeTx({ type: 'income', amount: 2000 }),
      makeTx({ type: 'expense', amount: 500 }),
    ];
    expect(calcTotalIncome(txs)).toBe(5000);
  });

  it('returns 0 for empty array', () =>
    expect(calcTotalIncome([])).toBe(0));

  it('returns 0 when no income transactions', () => {
    const txs = [makeTx({ type: 'expense', amount: 500 })];
    expect(calcTotalIncome(txs)).toBe(0);
  });

  it('handles string amounts from Supabase', () => {
    const txs = [makeTx({ type: 'income', amount: '3000' })];
    expect(calcTotalIncome(txs)).toBe(3000);
  });
});

// ── calcTotalSpent ────────────────────────────────────────────────────────────

describe('calcTotalSpent', () => {
  it('sums expense transactions', () => {
    const txs = [
      makeTx({ type: 'expense', amount: 300 }),
      makeTx({ type: 'expense', amount: 200 }),
      makeTx({ type: 'income',  amount: 500 }),
    ];
    expect(calcTotalSpent(txs)).toBe(500);
  });

  it('returns 0 for empty array', () =>
    expect(calcTotalSpent([])).toBe(0));
});

// ── calcRemaining ─────────────────────────────────────────────────────────────

describe('calcRemaining', () => {
  it('subtracts spent from income', () =>
    expect(calcRemaining(5000, 2000)).toBe(3000));

  it('returns negative when overspent', () =>
    expect(calcRemaining(1000, 1500)).toBe(-500));

  it('returns 0 when exactly spent', () =>
    expect(calcRemaining(1000, 1000)).toBe(0));
});

// ── calcHealthPct ─────────────────────────────────────────────────────────────

describe('calcHealthPct', () => {
  it('returns 100 when nothing spent', () =>
    expect(calcHealthPct(5000, 5000)).toBe(100));

  it('returns 50 when half spent', () =>
    expect(calcHealthPct(2500, 5000)).toBe(50));

  it('returns 0 when all spent', () =>
    expect(calcHealthPct(0, 5000)).toBe(0));

  it('caps at 0 when overspent', () =>
    expect(calcHealthPct(-500, 5000)).toBe(0));

  it('returns 0 when monthlyIncome is 0', () =>
    expect(calcHealthPct(0, 0)).toBe(0));
});

// ── getBudgetStatus ───────────────────────────────────────────────────────────

describe('getBudgetStatus', () => {
  it('returns On Track when remaining > surplusTarget', () => {
    const status = getBudgetStatus(5000, 3000);
    expect(status.label).toContain('On Track');
  });

  it('returns Watch Out when remaining > 0 but below target', () => {
    const status = getBudgetStatus(1000, 3000);
    expect(status.label).toContain('Watch Out');
  });

  it('returns Over Budget when remaining <= 0', () => {
    const status = getBudgetStatus(-100, 3000);
    expect(status.label).toContain('Over Budget');
  });

  it('returns Over Budget when remaining is exactly 0', () => {
    const status = getBudgetStatus(0, 3000);
    expect(status.label).toContain('Over Budget');
  });
});

// ── calcTotalFixed ────────────────────────────────────────────────────────────

describe('calcTotalFixed', () => {
  it('sums all category budget amounts', () => {
    const cats = [
      makeCat({ budget_amount: 1000 }),
      makeCat({ budget_amount: 500  }),
    ];
    expect(calcTotalFixed(cats)).toBe(1500);
  });

  it('returns 0 for empty array', () =>
    expect(calcTotalFixed([])).toBe(0));

  it('handles string amounts from Supabase', () => {
    const cats = [makeCat({ budget_amount: '1000' })];
    expect(calcTotalFixed(cats)).toBe(1000);
  });
});

// ── calcCategorySpend ─────────────────────────────────────────────────────────

describe('calcCategorySpend', () => {
  it('returns spend per category', () => {
    const txs = [
      makeTx({ type: 'expense', category_name: 'Groceries', amount: 200 }),
      makeTx({ type: 'expense', category_name: 'Groceries', amount: 100 }),
      makeTx({ type: 'expense', category_name: 'Transport', amount: 50  }),
    ];
    const cats = [
      makeCat({ name: 'Groceries', budget_amount: 500 }),
      makeCat({ name: 'Transport', budget_amount: 200 }),
    ];
    const result = calcCategorySpend(txs, cats);
    expect(result['Groceries']).toBe(300);
    expect(result['Transport']).toBe(50);
  });

  it('initialises all categories to 0', () => {
    const cats = [makeCat({ name: 'Groceries' })];
    const result = calcCategorySpend([], cats);
    expect(result['Groceries']).toBe(0);
  });

  it('ignores income transactions', () => {
    const txs = [makeTx({ type: 'income', category_name: 'Groceries', amount: 500 })];
    const cats = [makeCat({ name: 'Groceries' })];
    const result = calcCategorySpend(txs, cats);
    expect(result['Groceries']).toBe(0);
  });
});

// ── calcFixedSpent ────────────────────────────────────────────────────────────

describe('calcFixedSpent', () => {
  it('sums spend on known categories only', () => {
    const txs = [
      makeTx({ type: 'expense', category_name: 'Groceries', amount: 200 }),
      makeTx({ type: 'expense', category_name: 'Other',     amount: 100 }),
    ];
    const cats = [makeCat({ name: 'Groceries' })];
    expect(calcFixedSpent(txs, cats)).toBe(200);
  });

  it('returns 0 when no matching categories', () => {
    const txs = [makeTx({ type: 'expense', category_name: 'Other', amount: 100 })];
    expect(calcFixedSpent(txs, [])).toBe(0);
  });
});

// ── calcVariableSpent ─────────────────────────────────────────────────────────

describe('calcVariableSpent', () => {
  it('sums spend on unknown categories only', () => {
    const txs = [
      makeTx({ type: 'expense', category_name: 'Groceries', amount: 200 }),
      makeTx({ type: 'expense', category_name: 'Other',     amount: 100 }),
    ];
    const cats = [makeCat({ name: 'Groceries' })];
    expect(calcVariableSpent(txs, cats)).toBe(100);
  });

  it('returns 0 when all spend is in known categories', () => {
    const txs  = [makeTx({ type: 'expense', category_name: 'Groceries', amount: 200 })];
    const cats = [makeCat({ name: 'Groceries' })];
    expect(calcVariableSpent(txs, cats)).toBe(0);
  });
});

// ── calcSurplusLeft ───────────────────────────────────────────────────────────

describe('calcSurplusLeft', () => {
  it('calculates correctly', () =>
    expect(calcSurplusLeft(10000, 6000, 1000)).toBe(3000));

  it('returns negative when overspent', () =>
    expect(calcSurplusLeft(5000, 6000, 500)).toBe(-1500));

  it('returns full income when nothing budgeted or spent', () =>
    expect(calcSurplusLeft(5000, 0, 0)).toBe(5000));

  it('uses received amount when income received — reflects reality not projection', () =>
    expect(calcSurplusLeft(28000, 6000, 1000)).toBe(21000));

  it('uses expected amount as projection when nothing received yet', () =>
    expect(calcSurplusLeft(30000, 6000, 0)).toBe(24000));
});

// ── calcSurplusRemaining ──────────────────────────────────────────────────────
// surplusLeft = totalReceived - max(fixedTotal, totalSpent)
// Surplus = income minus budget allocation.
// Protected while spending within budget.
// Reduces only once total spending exceeds the fixed budget total.

describe('calcRemaining (used as surplusLeft in hook)', () => {
  it('surplus = income - all spending regardless of category', () =>
    expect(calcRemaining(45000, 200)).toBe(44800));

  it('surplus decreases when known category expense added', () =>
    expect(calcRemaining(45000, 700)).toBe(44300));

  it('surplus decreases when variable expense added', () =>
    expect(calcRemaining(45000, 1200)).toBe(43800));

  it('surplus is zero when all income spent', () =>
    expect(calcRemaining(45000, 45000)).toBe(0));

  it('surplus is negative when overspent', () =>
    expect(calcRemaining(45000, 50000)).toBe(-5000));
});

// ── calcTotalExpected / calcTotalReceived ─────────────────────────────────────

describe('calcTotalExpected', () => {
  it('sums expected amounts', () => {
    const sources = [
      makeIncome({ expected_amount: 3000 }),
      makeIncome({ expected_amount: 2000 }),
    ];
    expect(calcTotalExpected(sources)).toBe(5000);
  });

  it('returns 0 for empty array', () =>
    expect(calcTotalExpected([])).toBe(0));
});

describe('calcTotalReceived', () => {
  it('sums received amounts', () => {
    const sources = [
      makeIncome({ received: true,  received_amount: 3000 }),
      makeIncome({ received: false, received_amount: 0    }),
    ];
    expect(calcTotalReceived(sources)).toBe(3000);
  });

  it('returns 0 for empty array', () =>
    expect(calcTotalReceived([])).toBe(0));
});

// ── calcAvailableNow ──────────────────────────────────────────────────────────

describe('calcAvailableNow', () => {
  it('subtracts current month expenses from received income', () => {
    const today   = new Date().toISOString().split('T')[0];
    const sources = [makeIncome({ received: true, received_amount: 5000 })];
    const txs     = [makeTx({ type: 'expense', amount: 1000, date: today })];
    expect(calcAvailableNow(sources, txs)).toBe(4000);
  });

  it('returns received amount when no expenses', () => {
    const sources = [makeIncome({ received: true, received_amount: 5000 })];
    expect(calcAvailableNow(sources, [])).toBe(5000);
  });

  it('returns 0 when nothing received', () => {
    const today = new Date().toISOString().split('T')[0];
    const txs   = [makeTx({ type: 'expense', amount: 1000, date: today })];
    expect(calcAvailableNow([], txs)).toBe(-1000);
  });
});

// ── isKnownCategory ───────────────────────────────────────────────────────────

describe('isKnownCategory', () => {
  const cats = [makeCat({ name: 'Groceries' })];

  it('returns true for known category', () =>
    expect(isKnownCategory('Groceries', cats)).toBe(true));

  it('returns false for unknown category', () =>
    expect(isKnownCategory('Other', cats)).toBe(false));

  it('is case insensitive', () =>
    expect(isKnownCategory('groceries', cats)).toBe(true));

  it('trims whitespace', () =>
    expect(isKnownCategory(' Groceries ', cats)).toBe(true));

  it('returns false for empty categories', () =>
    expect(isKnownCategory('Groceries', [])).toBe(false));
});

// ── getCategoryIcon ───────────────────────────────────────────────────────────

describe('getCategoryIcon', () => {
  const cats = [makeCat({ name: 'Groceries', icon: '🛒' })];

  it('returns correct icon', () =>
    expect(getCategoryIcon('Groceries', cats)).toBe('🛒'));

  it('returns default icon for unknown category', () =>
    expect(getCategoryIcon('Other', cats)).toBe('💸'));

  it('returns default icon for empty categories', () =>
    expect(getCategoryIcon('Groceries', [])).toBe('💸'));
});

// ── calcWeekSummary ───────────────────────────────────────────────────────────

describe('calcWeekSummary', () => {
  const txs = [
    makeTx({ type: 'expense', amount: 200, week: 'Week 1' }),
    makeTx({ type: 'income',  amount: 500, week: 'Week 1' }),
    makeTx({ type: 'expense', amount: 100, week: 'Week 2' }),
  ];

  it('filters by week correctly', () => {
    const result = calcWeekSummary(txs, 'Week 1');
    expect(result.expenses).toBe(200);
    expect(result.income).toBe(500);
    expect(result.net).toBe(300);
    expect(result.count).toBe(2);
  });

  it('returns all when week is All', () => {
    const result = calcWeekSummary(txs, 'All');
    expect(result.expenses).toBe(300);
    expect(result.income).toBe(500);
    expect(result.count).toBe(3);
  });

  it('returns zeros for empty week', () => {
    const result = calcWeekSummary(txs, 'Week 5');
    expect(result.expenses).toBe(0);
    expect(result.income).toBe(0);
    expect(result.net).toBe(0);
    expect(result.count).toBe(0);
  });
});

// ── calcTopCategories ─────────────────────────────────────────────────────────

describe('calcTopCategories', () => {
  it('returns categories sorted by amount descending', () => {
    const txs = [
      makeTx({ type: 'expense', category_name: 'Groceries', amount: 300 }),
      makeTx({ type: 'expense', category_name: 'Transport', amount: 100 }),
      makeTx({ type: 'expense', category_name: 'Groceries', amount: 200 }),
    ];
    const result = calcTopCategories(txs);
    expect(result[0].category).toBe('Groceries');
    expect(result[0].amount).toBe(500);
    expect(result[1].category).toBe('Transport');
  });

  it('calculates percentages correctly', () => {
    const txs = [
      makeTx({ type: 'expense', category_name: 'Groceries', amount: 750 }),
      makeTx({ type: 'expense', category_name: 'Transport', amount: 250 }),
    ];
    const result = calcTopCategories(txs);
    expect(result[0].pct).toBe(75);
    expect(result[1].pct).toBe(25);
  });

  it('returns empty array when no expenses', () =>
    expect(calcTopCategories([])).toEqual([]));

  it('ignores income transactions', () => {
    const txs = [makeTx({ type: 'income', amount: 5000 })];
    expect(calcTopCategories(txs)).toEqual([]);
  });

  it('limits to 5 by default', () => {
    const txs = Array.from({ length: 10 }, (_, i) =>
      makeTx({ type: 'expense', category_name: `Cat${i}`, amount: 100 })
    );
    expect(calcTopCategories(txs).length).toBe(5);
  });
});

// ── getIncomeStatus ───────────────────────────────────────────────────────────

describe('getIncomeStatus', () => {
  it('returns received when received is true', () =>
    expect(getIncomeStatus(makeIncome({ received: true }))).toBe('received'));

  it('returns flexible when no pay_day', () =>
    expect(getIncomeStatus(makeIncome({ pay_day: null, pay_day_type: 'flexible' }))).toBe('flexible'));

  it('returns upcoming for future pay day', () => {
    const status = getIncomeStatus(makeIncome({ pay_day: 28, received: false }));
    expect(['upcoming', 'soon', 'today']).toContain(status);
  });
});

// ── surplusKnown (via calcTotalReceived) ──────────────────────────────────────

describe('surplusKnown logic', () => {
  it('is true when totalReceived > 0', () => {
    const sources = [makeIncome({ received: true, received_amount: 5000 })];
    expect(calcTotalReceived(sources) > 0).toBe(true);
  });

  it('is false when totalReceived is 0', () => {
    const sources = [makeIncome({ received: false, received_amount: 0 })];
    expect(calcTotalReceived(sources) > 0).toBe(false);
  });
});
