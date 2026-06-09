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
  cyclesLoading:     false,
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
  moveTransaction:   vi.fn().mockResolvedValue({ data: {}, error: null }),
};

vi.mock('../context/FinanceContext', () => ({
  useFinanceContext: () => ({ ...mockFinance, visibleCycles: mockFinance.visibleCycles ?? mockFinance.cycles }),
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

  it('renders nothing while cycles are loading (cold-load flash gate)', () => {
    mockFinance.cyclesLoading = true;
    const { container } = renderView();
    expect(container.firstChild).toBeNull();
    mockFinance.cyclesLoading = false;
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

  // History gate (D6/D8) — historyLocked is computed in the view and passed to <PeriodNav>.
  const JUN = { id: 'cyc-jun', name: 'June 2026',  start_date: '2026-06-01', end_date: '2026-06-30', deleted_at: null };
  const MAR = { id: 'cyc-mar', name: 'March 2026', start_date: '2026-03-01', end_date: '2026-03-31', deleted_at: null };

  it('free with hidden cycles at the oldest VISIBLE cycle: prev arrow is a tappable upgrade affordance', () => {
    // 4 cycles, free window = 3 (Jun/May/Apr); Mar hidden. Viewing Apr (oldest visible).
    withCycles({ cycles: [JUN, MAY, APR, MAR], visibleCycles: [JUN, MAY, APR], activeCycleId: 'cyc-apr', userPlan: 'free' });
    renderView();
    const affordance = screen.getByTestId('upgrade-history-affordance');
    expect(affordance.disabled).toBe(false);
    fireEvent.click(affordance);
    expect(screen.getByText(/history limit/)).toBeTruthy();
    reset();
  });
});

// ── Move to period (Commit 12) ────────────────────────────────────────────────
describe('LogView — move to period', () => {
  // Clock frozen mid-May: MAY contains today (current), APR has ended (past).
  const MAY = { id: 'cyc-may', name: 'May 2026',   start_date: '2026-05-01', end_date: '2026-05-31', deleted_at: null };
  const APR = { id: 'cyc-apr', name: 'April 2026', start_date: '2026-04-01', end_date: '2026-04-30', deleted_at: null };

  beforeEach(() => {
    mockCan = () => true;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-05-15T00:00:00Z'));
    mockFinance.cycles = [MAY, APR];
    mockFinance.activeCycle = MAY;
    mockFinance.activeCycleId = null;
    mockFinance.txs = mockTxs;
    mockFinance.moveTransaction = vi.fn().mockResolvedValue({ data: {}, error: null });
  });
  afterEach(() => {
    vi.useRealTimers();
    mockFinance.cycles = []; mockFinance.activeCycle = null; mockFinance.activeCycleId = null;
  });

  const openMoveSheet = () => {
    renderView();
    fireEvent.click(screen.getByTestId('tx-menu-tx-1'));
    fireEvent.click(screen.getByTestId('tx-move-tx-1'));
  };

  it('kebab → "Move to period" opens the move sheet listing destination periods', () => {
    openMoveSheet();
    expect(screen.getByTestId('move-cycle-sheet')).toBeTruthy();
    expect(screen.getByTestId('move-cycle-option-cyc-may')).toBeTruthy();
    expect(screen.getByTestId('move-cycle-option-cyc-apr')).toBeTruthy();
  });

  it('moving to a current period calls moveTransaction immediately (no guard)', async () => {
    openMoveSheet();
    fireEvent.click(screen.getByTestId('move-cycle-option-cyc-may'));
    fireEvent.click(screen.getByTestId('move-confirm-btn'));
    await vi.waitFor(() => expect(mockFinance.moveTransaction).toHaveBeenCalledWith('tx-1', 'cyc-may'));
    expect(screen.queryByText('Edit past period?')).toBeNull();
  });

  it('moving to a past period asks for confirmation before moving', async () => {
    openMoveSheet();
    fireEvent.click(screen.getByTestId('move-cycle-option-cyc-apr'));
    fireEvent.click(screen.getByTestId('move-confirm-btn'));
    const confirm = await screen.findByText('Edit past period?');
    expect(confirm).toBeTruthy();
    expect(mockFinance.moveTransaction).not.toHaveBeenCalled();   // held behind the guard
    fireEvent.click(screen.getByText('Continue'));
    await vi.waitFor(() => expect(mockFinance.moveTransaction).toHaveBeenCalledWith('tx-1', 'cyc-apr'));
  });
});
