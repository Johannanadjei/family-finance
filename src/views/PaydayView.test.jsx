/**
 * views/PaydayView.test.jsx
 * Reads financeValues from FinanceContext — no props.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter }             from 'react-router-dom';
import { PaydayView }               from './PaydayView';
import { mockCentre, mockFmt, mockIncomes } from '../test-utils/fixtures';

vi.mock('../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({ centre: mockCentre, fmt: mockFmt, can: () => true }),
}));

// Base finance context — overridden per test via mockFinance
const mockFinance = {
  loading:        false,
  error:          null,
  incomes:        mockIncomes,
  allIncomes:     mockIncomes,
  txs:            [],
  totalReceived:  30000,
  totalExpected:  45000,
  totalPending:   15000,
  totalIncome:    0,
  activeMonth:    '2026-05',
  loadMonth:      vi.fn(),
  // Cycle state — default empty so existing tests ride the month-based fallback.
  cycles:         [],
  activeCycle:    null,
  activeCycleId:  null,
  loadCycle:      vi.fn(),
  markReceived:   vi.fn().mockResolvedValue({ error: null }),
  markPending:    vi.fn().mockResolvedValue({ error: null }),
  updateExpectedAmount: vi.fn().mockResolvedValue({ error: null }),
  copyIncomeSourcesToMonth: vi.fn().mockResolvedValue({ data: [], error: null }),
};

vi.mock('../context/FinanceContext', () => ({
  useFinanceContext: () => mockFinance,
}));

const renderView = () => render(<MemoryRouter><PaydayView /></MemoryRouter>);

describe('PaydayView', () => {
  // Freeze the clock to mid-May so getCurrentMonth() === the mock's default
  // activeMonth ('2026-05'). shouldAdvanceTime keeps async waitFor polling alive.
  // Past/future tests still override mockFinance.activeMonth themselves.
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-05-15T00:00:00Z'));
  });
  afterEach(() => { vi.useRealTimers(); });

  it('shows skeleton when loading', () => {
    mockFinance.loading = true;
    const { container } = renderView();
    expect(container.firstChild).toBeTruthy();
    mockFinance.loading = false;
  });

  it('shows period label', () => {
    renderView();
    expect(screen.getByTestId('payday-period-label').textContent).toContain('2026');
  });

  it('shows total received', () => {
    renderView();
    expect(screen.getByTestId('payday-total-received').textContent).toBe('GHS 30,000');
  });

  it('shows total pending', () => {
    renderView();
    expect(screen.getByTestId('payday-total-pending').textContent).toBe('GHS 15,000');
  });

  it('shows all income streams', () => {
    renderView();
    expect(screen.getByText('Adjei Salary')).toBeTruthy();
    expect(screen.getByText('Dita Salary')).toBeTruthy();
  });

  it('no longer shows the legacy historical-data warning on a past month', () => {
    mockFinance.activeMonth = '2026-04';
    renderView();
    expect(screen.queryByText(/reflects current state/)).toBeNull();
    mockFinance.activeMonth = '2026-05';
  });

  it('derives the Received total from transactions on a past month (changes between months)', () => {
    mockFinance.activeMonth  = '2026-04';
    mockFinance.totalIncome  = 12000; // April income, from txs
    mockFinance.txs          = [{ id: 'tx-i', type: 'income', amount: 12000, category_name: 'Adjei Salary' }];
    renderView();
    const received = screen.getByTestId('payday-total-received').textContent;
    expect(received).toBe('GHS 12,000');
    // proves month-awareness: NOT the current-month income_sources total (30,000)
    expect(received).not.toBe('GHS 30,000');
    // past-month read-only card renders from the transaction
    expect(screen.getByText('Adjei Salary')).toBeTruthy();
    // Pending half is omitted on past months
    expect(screen.queryByTestId('payday-total-pending')).toBeNull();
    mockFinance.activeMonth = '2026-05';
    mockFinance.totalIncome = 0;
    mockFinance.txs         = [];
  });

  it('shows empty state for a past month with no income transactions', () => {
    mockFinance.activeMonth = '2026-04';
    mockFinance.txs         = [];
    renderView();
    expect(screen.getByText(/No income recorded for/)).toBeTruthy();
    mockFinance.activeMonth = '2026-05';
  });

  it('shows empty state and no totals for a future month', () => {
    mockFinance.activeMonth = '2026-06';
    renderView();
    expect(screen.getByText(/No payday data for/)).toBeTruthy();
    expect(screen.queryByTestId('payday-total-received')).toBeNull();
    expect(screen.queryByTestId('payday-total-pending')).toBeNull();
    mockFinance.activeMonth = '2026-05';
  });

  it('shows empty state when no income sources', () => {
    mockFinance.incomes = [];
    renderView();
    expect(screen.getByText(/No income tracked for/)).toBeTruthy();
    expect(screen.getByTestId('add-manually-btn')).toBeTruthy();
    mockFinance.incomes = mockIncomes;
  });

  // ── Phase 2B rollforward empty-state ──────────────────────────────────────
  const PREV_SOURCES = [
    { id: 'p1', label: 'Adjei Salary', icon: '💰', expected_amount: 30000, currency: 'GHS', month: '2026-04', notes: '' },
    { id: 'p2', label: 'Dita Salary',  icon: '💼', expected_amount: 15000, currency: 'GHS', month: '2026-04', notes: '' },
  ];
  const resetIncomes = () => { mockFinance.incomes = mockIncomes; mockFinance.allIncomes = mockIncomes; };

  it('rollforward State 3: shows the "Yes, copy N sources" CTA when the previous month had sources', () => {
    mockFinance.incomes    = [];
    mockFinance.allIncomes = PREV_SOURCES;
    renderView();
    expect(screen.getByText(/Income same as/)).toBeTruthy();
    expect(screen.getByTestId('copy-all-btn').textContent).toBe('Yes, copy 2 sources');
    expect(screen.getByTestId('choose-which-btn')).toBeTruthy();
    resetIncomes();
  });

  it('rollforward: a bucket-only previous month falls back to State 1 (no copy CTA)', () => {
    mockFinance.incomes    = [];
    mockFinance.allIncomes = [{ id: 'b1', label: 'Other Income', icon: '💰', expected_amount: 0, currency: 'GHS', month: '2026-04', notes: '__one_off_bucket__' }];
    renderView();
    expect(screen.queryByTestId('copy-all-btn')).toBeNull();
    expect(screen.getByTestId('add-manually-btn')).toBeTruthy();
    resetIncomes();
  });

  it('rollforward: tapping "Yes, copy N" calls copyIncomeSourcesToMonth(prevMonth, activeMonth) with no subset', async () => {
    mockFinance.incomes    = [];
    mockFinance.allIncomes = PREV_SOURCES;
    const copyFn = vi.fn().mockResolvedValue({ data: [{ id: 'n1' }, { id: 'n2' }], error: null });
    mockFinance.copyIncomeSourcesToMonth = copyFn;
    renderView();
    fireEvent.click(screen.getByTestId('copy-all-btn'));
    await waitFor(() => expect(copyFn).toHaveBeenCalledWith('2026-04', '2026-05', undefined));
    mockFinance.copyIncomeSourcesToMonth = vi.fn().mockResolvedValue({ data: [], error: null });
    resetIncomes();
  });

  it('rollforward: tapping "Choose which to copy" opens the multi-select sheet', () => {
    mockFinance.incomes    = [];
    mockFinance.allIncomes = PREV_SOURCES;
    renderView();
    fireEvent.click(screen.getByTestId('choose-which-btn'));
    expect(screen.getByTestId('copy-income-sheet')).toBeTruthy();
    resetIncomes();
  });

  it('shows error state when error is set', () => {
    mockFinance.error = 'Failed to load';
    renderView();
    expect(screen.getByText(/Failed to load/)).toBeTruthy();
    mockFinance.error = null;
  });

  it('shows previous period navigation button', () => {
    renderView();
    expect(screen.getByLabelText('Previous period')).toBeTruthy();
  });

  it('disables next-period navigation on the latest period', () => {
    renderView();
    expect(screen.getByLabelText('Next period').disabled).toBe(true);
  });
});

// ── Cycle navigation (Commit 5) ───────────────────────────────────────────────
// Exercises the cycle path (vs the month-based fallback the suite above uses).
describe('PaydayView — cycle navigation', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-05-15T00:00:00Z'));
  });
  afterEach(() => { vi.useRealTimers(); });

  const MAY = { id: 'cyc-may', name: 'May 2026',   start_date: '2026-05-01', end_date: '2026-05-31', deleted_at: null };
  const APR = { id: 'cyc-apr', name: 'April 2026', start_date: '2026-04-01', end_date: '2026-04-30', deleted_at: null };

  const withCycles = (over) => {
    mockFinance.cycles        = [MAY, APR];   // newest first
    mockFinance.activeCycle   = MAY;
    mockFinance.activeCycleId = null;          // → falls back to activeCycle (MAY)
    mockFinance.loadCycle     = vi.fn();
    Object.assign(mockFinance, over);
  };
  const reset = () => {
    mockFinance.cycles = []; mockFinance.activeCycle = null;
    mockFinance.activeCycleId = null; mockFinance.loadCycle = vi.fn();
  };

  it('labels the header with the viewed cycle name', () => {
    withCycles();
    renderView();
    expect(screen.getByTestId('payday-period-label').textContent).toBe('May 2026');
    reset();
  });

  it('Next is disabled on the latest cycle; Prev navigates to the older cycle', () => {
    withCycles();
    renderView();
    expect(screen.getByLabelText('Next period').disabled).toBe(true);   // MAY is latest
    fireEvent.click(screen.getByLabelText('Previous period'));
    expect(mockFinance.loadCycle).toHaveBeenCalledWith('cyc-apr');
    reset();
  });

  it('Prev is disabled on the oldest cycle', () => {
    withCycles({ activeCycleId: 'cyc-apr' });   // viewing April (oldest)
    renderView();
    expect(screen.getByLabelText('Previous period').disabled).toBe(true);
    expect(screen.getByLabelText('Next period').disabled).toBe(false);
    reset();
  });
});
