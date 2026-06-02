/**
 * views/DailyView.test.jsx
 * Written before DailyView.jsx — TDD.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter }             from 'react-router-dom';
import { DailyView }                from './DailyView';
import { mockCentre, mockFmt, mockTxs, mockWeeklyData } from '../test-utils/fixtures';

let mockCan = () => true;
vi.mock('../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({ centre: mockCentre, fmt: mockFmt, can: (p) => mockCan(p) }),
}));

const mockFinance = {
  loading:           false,
  error:             null,
  txs:               mockTxs,
  totalSpent:        200,
  weeklyData:        mockWeeklyData,
  activeMonth:       '2026-05',
  loadMonth:         vi.fn(),
  // Cycle state — default empty so existing tests ride the month-based fallback.
  cycles:            [],
  activeCycle:       null,
  activeCycleId:     null,
  loadCycle:         vi.fn(),
  deleteTransaction: vi.fn().mockResolvedValue({ error: null }),
};

vi.mock('../context/FinanceContext', () => ({
  useFinanceContext: () => mockFinance,
}));

const renderView = () => render(<MemoryRouter><DailyView /></MemoryRouter>);

describe('DailyView', () => {
  // Freeze the clock to mid-May so getCurrentMonth() === the mock's activeMonth
  // ('2026-05'); month-sensitive assertions must not depend on the real date.
  beforeEach(() => {
    mockCan = () => true;
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
    expect(screen.getByTestId('daily-period-label').textContent).toContain('2026');
  });

  it('shows total spent for the month', () => {
    renderView();
    expect(screen.getByTestId('daily-total-spent').textContent).toBe('GHS 200');
  });

  it('shows weekly summary bar', () => {
    renderView();
    expect(screen.getByTestId('week-tab-Week 1')).toBeTruthy();
  });

  it('shows all transactions grouped by date for owner/full_access', () => {
    renderView();
    expect(screen.getByText('Groceries')).toBeTruthy();
    expect(screen.getByText('Adjei Salary')).toBeTruthy();
  });

  it('standard member sees only expense transactions', () => {
    mockCan = () => false;
    renderView();
    expect(screen.getByText('Groceries')).toBeTruthy();
    expect(screen.queryByText('Adjei Salary')).toBeNull();
  });

  it('shows empty state when no transactions', () => {
    mockFinance.txs = [];
    renderView();
    expect(screen.getByText(/Nothing logged yet/)).toBeTruthy();
    mockFinance.txs = mockTxs;
  });

  it('shows error state when error is set', () => {
    mockFinance.error = 'Failed to load';
    renderView();
    expect(screen.getByText(/Failed to load/)).toBeTruthy();
    mockFinance.error = null;
  });

  it('shows past period warning when not the current period', () => {
    mockFinance.activeMonth = '2026-04';
    renderView();
    expect(screen.getByText(/Viewing a past period/)).toBeTruthy();
    mockFinance.activeMonth = '2026-05';
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

// ── Cycle navigation (Commit 6) ───────────────────────────────────────────────
// Exercises the cycle path (vs the month-based fallback the suite above uses).
describe('DailyView — cycle navigation', () => {
  beforeEach(() => {
    mockCan = () => true;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-05-15T00:00:00Z'));
  });
  afterEach(() => { vi.useRealTimers(); });

  const MAY = { id: 'cyc-may', name: 'May 2026',   start_date: '2026-05-01', end_date: '2026-05-31', deleted_at: null };
  const APR = { id: 'cyc-apr', name: 'April 2026', start_date: '2026-04-01', end_date: '2026-04-30', deleted_at: null };

  const withCycles = (over) => {
    mockFinance.cycles = [MAY, APR]; mockFinance.activeCycle = MAY;
    mockFinance.activeCycleId = null; mockFinance.loadCycle = vi.fn();
    Object.assign(mockFinance, over);
  };
  const reset = () => {
    mockFinance.cycles = []; mockFinance.activeCycle = null;
    mockFinance.activeCycleId = null; mockFinance.loadCycle = vi.fn();
  };

  it('labels the header with the viewed cycle name', () => {
    withCycles();
    renderView();
    expect(screen.getByTestId('daily-period-label').textContent).toBe('May 2026');
    reset();
  });

  it('Next disabled on the latest cycle; Prev navigates to the older cycle', () => {
    withCycles();
    renderView();
    expect(screen.getByLabelText('Next period').disabled).toBe(true);   // MAY is latest
    fireEvent.click(screen.getByLabelText('Previous period'));
    expect(mockFinance.loadCycle).toHaveBeenCalledWith('cyc-apr');
    reset();
  });

  it('past cycle is read-only: shows the warning and disables Prev at the oldest', () => {
    withCycles({ activeCycleId: 'cyc-apr' });   // viewing April (oldest, past)
    renderView();
    expect(screen.getByText(/Viewing a past period/)).toBeTruthy();
    expect(screen.getByLabelText('Previous period').disabled).toBe(true);
    expect(screen.getByLabelText('Next period').disabled).toBe(false);
    reset();
  });
});
