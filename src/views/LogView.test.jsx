/**
 * views/LogView.test.jsx
 * Written before LogView.jsx — TDD.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter }             from 'react-router-dom';
import { LogView }                  from './LogView';
import { mockCentre, mockFmt, mockTxs } from '../test-utils/fixtures';

let mockCan = () => true;
vi.mock('../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({ centre: mockCentre, fmt: mockFmt, can: (p) => mockCan(p), currentUserId: 'user-1' }),
}));

const mockFinance = {
  loading:           false,
  error:             null,
  txs:               mockTxs,
  activeMonth:       '2026-05',
  loadMonth:         vi.fn(),
  // Cycle state — default empty so existing tests ride the month-based fallback.
  cycles:            [],
  activeCycle:       null,
  activeCycleId:     null,
  loadCycle:         vi.fn(),
  deleteTransaction: vi.fn().mockResolvedValue({ error: null }),
  updateTransaction: vi.fn().mockResolvedValue({ error: null }),
};

vi.mock('../context/FinanceContext', () => ({
  useFinanceContext: () => mockFinance,
}));

const renderView = (props = {}) =>
  render(<MemoryRouter><LogView onEditTx={vi.fn()} {...props} /></MemoryRouter>);

// standard role: can log expenses but cannot view income or all txs
const standardCan = (p) => p === 'log';

describe('LogView', () => {
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
    expect(screen.getByTestId('log-period-label').textContent).toContain('2026');
  });

  it('shows filter bar', () => {
    renderView();
    expect(screen.getByTestId('log-filter-all')).toBeTruthy();
  });

  it('shows search input', () => {
    renderView();
    expect(screen.getByTestId('log-search-input')).toBeTruthy();
  });

  it('shows all transactions by default for owner/full_access', () => {
    renderView();
    expect(screen.getByText('Groceries')).toBeTruthy();
    expect(screen.getByText('Adjei Salary')).toBeTruthy();
  });

  it('standard member sees only expense transactions', () => {
    mockCan = standardCan;
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

  it('shows error state when error set', () => {
    mockFinance.error = 'Failed to load';
    renderView();
    expect(screen.getByText(/Failed to load/)).toBeTruthy();
    mockFinance.error = null;
  });

  it('shows previous period button', () => {
    renderView();
    expect(screen.getByLabelText('Previous period')).toBeTruthy();
  });

  it('disables next-period navigation on the latest period', () => {
    renderView();
    expect(screen.getByLabelText('Next period').disabled).toBe(true);
  });
});

// ── Cycle navigation (Commit 7) ───────────────────────────────────────────────
// Exercises the cycle path (vs the month-based fallback the suite above uses).
describe('LogView — cycle navigation', () => {
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
    expect(screen.getByTestId('log-period-label').textContent).toBe('May 2026');
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

  it('Prev disabled on the oldest cycle; Next enabled', () => {
    withCycles({ activeCycleId: 'cyc-apr' });   // viewing April (oldest)
    renderView();
    expect(screen.getByLabelText('Previous period').disabled).toBe(true);
    expect(screen.getByLabelText('Next period').disabled).toBe(false);
    reset();
  });
});
