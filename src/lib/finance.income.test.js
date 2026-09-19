/**
 * lib/finance.income.test.js
 *
 * The income-received selectors (#4b). Split out of finance.test.js when that file
 * crossed the 600-line audit cap.
 *
 * These encode ONE rule: received income is the sum of non-deleted income
 * TRANSACTIONS in the cycle — never income_sources.received_amount. Home and Payday
 * both read these, so they cannot disagree the way they did in production.
 */

import { describe, it, expect } from 'vitest';
import {
  calcTotalIncome,
  calcTotalReceived,
  calcReceivedForSource,
  calcUnassignedIncome,
  calcAvailableNow,
} from './finance';
// Local, matching finance.test.js — CLAUDE.md §8 keeps shared mock DATA in
// test-utils/fixtures.js; this is a builder, and its twin already lives inline there.
const makeTx = (overrides = {}) => ({
  id:            'tx-1',
  type:          'expense',
  amount:        100,
  date:          '2026-05-01',
  week:          'Week 1',
  category_name: 'Groceries',
  ...overrides,
});

// #4b - received is derived from TRANSACTIONS, not from income_sources columns.
// These take txs; passing sources (the old signature) now correctly yields 0.
describe('calcTotalReceived', () => {
  it('sums every live income transaction, assigned or not', () => {
    const txs = [
      makeTx({ type: 'income',  amount: 3000, income_source_id: 'src-1' }),
      makeTx({ type: 'income',  amount: 2000, income_source_id: null    }),
      makeTx({ type: 'expense', amount: 900 }),
    ];
    expect(calcTotalReceived(txs)).toBe(5000);
  });

  it('excludes soft-deleted income transactions', () => {
    const txs = [
      makeTx({ type: 'income', amount: 3000, income_source_id: 'src-1' }),
      makeTx({ type: 'income', amount: 3000, income_source_id: 'src-1', deleted_at: '2026-09-12T10:00:00Z' }),
    ];
    expect(calcTotalReceived(txs)).toBe(3000);
  });

  it('equals calcTotalIncome by construction - the #4b invariant', () => {
    const txs = [
      makeTx({ type: 'income',  amount: 27942, income_source_id: null }),
      makeTx({ type: 'income',  amount: 27942, income_source_id: 'src-1' }),
      makeTx({ type: 'expense', amount: 5000 }),
    ];
    expect(calcTotalReceived(txs)).toBe(calcTotalIncome(txs));
  });

  it('returns 0 for empty array', () =>
    expect(calcTotalReceived([])).toBe(0));
});

describe('calcReceivedForSource', () => {
  const txs = [
    makeTx({ type: 'income',  amount: 3000, income_source_id: 'src-1' }),
    makeTx({ type: 'income',  amount: 1500, income_source_id: 'src-1' }),
    makeTx({ type: 'income',  amount: 9999, income_source_id: 'src-2' }),
    makeTx({ type: 'income',  amount: 2000, income_source_id: null    }),
    makeTx({ type: 'expense', amount: 4000, income_source_id: 'src-1' }),
  ];

  it('sums only transactions carrying that source FK', () => {
    expect(calcReceivedForSource(txs, 'src-1')).toBe(4500);
  });

  it('ignores other sources, unassigned rows, and expenses', () => {
    expect(calcReceivedForSource(txs, 'src-2')).toBe(9999);
  });

  it('excludes soft-deleted rows', () => {
    const withDeleted = [...txs, makeTx({ type: 'income', amount: 5000, income_source_id: 'src-1', deleted_at: '2026-09-12T10:00:00Z' })];
    expect(calcReceivedForSource(withDeleted, 'src-1')).toBe(4500);
  });

  it('returns 0 for a source with no transactions - the unreceived case', () => {
    expect(calcReceivedForSource(txs, 'src-never')).toBe(0);
  });
});

describe('calcUnassignedIncome', () => {
  it('sums income transactions with no source FK', () => {
    const txs = [
      makeTx({ type: 'income',  amount: 27942, income_source_id: null }),
      makeTx({ type: 'income',  amount: 27942, income_source_id: 'src-1' }),
      makeTx({ type: 'expense', amount: 1000,  income_source_id: null }),
    ];
    expect(calcUnassignedIncome(txs)).toBe(27942);
  });

  it('excludes soft-deleted rows', () => {
    const txs = [
      makeTx({ type: 'income', amount: 2000, income_source_id: null }),
      makeTx({ type: 'income', amount: 8000, income_source_id: null, deleted_at: '2026-09-12T10:00:00Z' }),
    ];
    expect(calcUnassignedIncome(txs)).toBe(2000);
  });

  it('is 0 when every income row is assigned', () => {
    expect(calcUnassignedIncome([makeTx({ type: 'income', amount: 3000, income_source_id: 'src-1' })])).toBe(0);
  });

  // THE production case: assigned + unassigned must reconstruct the total exactly.
  it('plus the assigned sources equals the total - nothing lost, nothing double-counted', () => {
    const txs = [
      makeTx({ type: 'income', amount: 27942, income_source_id: null }),
      makeTx({ type: 'income', amount: 27942, income_source_id: 'src-1' }),
    ];
    expect(calcUnassignedIncome(txs) + calcReceivedForSource(txs, 'src-1')).toBe(calcTotalReceived(txs));
  });
});

// ── calcAvailableNow ──────────────────────────────────────────────────────────

describe('calcAvailableNow', () => {
  const today = new Date().toISOString().split('T')[0];

  it('subtracts current month expenses from received income', () => {
    const txs = [
      makeTx({ type: 'income',  amount: 5000, date: today, income_source_id: 'src-1' }),
      makeTx({ type: 'expense', amount: 1000, date: today }),
    ];
    expect(calcAvailableNow(txs)).toBe(4000);
  });

  it('returns received amount when no expenses', () => {
    expect(calcAvailableNow([makeTx({ type: 'income', amount: 5000, date: today, income_source_id: 'src-1' })])).toBe(5000);
  });

  it('goes negative when nothing was received', () => {
    expect(calcAvailableNow([makeTx({ type: 'expense', amount: 1000, date: today })])).toBe(-1000);
  });
});

// ── surplusKnown (via calcTotalReceived) ──────────────────────────────────────

describe('surplusKnown logic', () => {
  it('is true when an income transaction exists', () => {
    expect(calcTotalReceived([makeTx({ type: 'income', amount: 5000, income_source_id: 'src-1' })]) > 0).toBe(true);
  });

  it('is false when the only income transaction is soft-deleted', () => {
    expect(calcTotalReceived([makeTx({ type: 'income', amount: 5000, deleted_at: '2026-09-12T10:00:00Z' })]) > 0).toBe(false);
  });
});
