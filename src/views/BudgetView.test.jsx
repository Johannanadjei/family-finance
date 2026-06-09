/**
 * views/BudgetView.test.jsx
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter }             from 'react-router-dom';
import { BudgetView }               from './BudgetView';
import { getCurrentMonth, offsetMonth } from '../lib/finance';
import { mockCentre, mockFmt, mockCategories, mockPrevMonthCategories, mockTxs } from '../test-utils/fixtures';

// Mutable so tests can flip `allCategories` empty to exercise the rollforward state.
// BudgetView reads allCategories and filters the viewed cycle locally by cycle_id
// (Commit 11.5), recomputing spend from txs — so the mock provides those, not totals.
let mockCan = () => true;   // owner/full_access by default; standard-member tests flip it
const mockBudgetCentre = {
  centre:                  mockCentre,
  fmt:                     mockFmt,
  can:                     (p) => mockCan(p),
  reloadCategories:        vi.fn().mockResolvedValue(undefined),   // post-reset re-sync
  allCategories:           mockCategories,                 // month === current month
  addCategory:             vi.fn().mockResolvedValue({ error: null }),
  getCatIcon:              (name) => name === 'Groceries' ? '🛒' : '🚗',
  prevMonthCategories:     [],
  loadPrevMonthCategories: vi.fn().mockResolvedValue({ data: [], error: null }),
  copyCategoriesToMonth:   vi.fn().mockResolvedValue({ data: [], error: null }),
};

vi.mock('../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => mockBudgetCentre,
}));

// Categories slice by cycle_id now (Commit 11.5); mockCategories carry cycle_id
// 'cyc-this', so the default finance state must expose a current cycle of that id.
// Its name is the current-month label so the period-label assertion is unchanged.
const CM       = getCurrentMonth();
const CM_LABEL = new Date(CM + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const THIS_CYCLE = { id: 'cyc-this', name: CM_LABEL, start_date: CM + '-01', end_date: CM + '-31', deleted_at: null };

const mockFinance = {
  loading:       false,
  cyclesLoading: false,
  error:         null,
  txs:           mockTxs,             // one Groceries expense (200) + one income
  activeMonth:   getCurrentMonth(),
  cycles:        [THIS_CYCLE],
  activeCycle:   THIS_CYCLE,
  activeCycleId: null,                // null → follows the auto-resolved current cycle
  loadCycle:     vi.fn(),
  resetPeriod:   vi.fn().mockResolvedValue({ data: { categories_reset: 0, transactions_reset: 0 }, error: null }),
  userPlan:      'free',
};

vi.mock('../context/FinanceContext', () => ({
  // visibleCycles defaults to the full cycles list (full visibility) unless a test
  // sets mockFinance.visibleCycles explicitly (history at-wall cases).
  useFinanceContext: () => ({ ...mockFinance, visibleCycles: mockFinance.visibleCycles ?? mockFinance.cycles }),
}));

const renderView = () => render(<MemoryRouter><BudgetView /></MemoryRouter>);

const resetCats = () => { mockBudgetCentre.allCategories = mockCategories; mockBudgetCentre.prevMonthCategories = []; };

describe('BudgetView', () => {
  it('shows skeleton when loading', () => {
    mockFinance.loading = true;
    const { container } = renderView();
    expect(container.firstChild).toBeTruthy();
    mockFinance.loading = false;
  });

  it('shows the period label at the top of the view', () => {
    renderView();
    const expected = new Date(getCurrentMonth() + '-01')
      .toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    expect(screen.getByTestId('budget-period-label').textContent).toContain(expected);
  });

  it('shows total planned budget (recomputed from the viewed cycle plan)', () => {
    renderView();
    expect(screen.getByTestId('budget-total-planned').textContent).toBe('GHS 700');
  });

  it('shows total fixed spent (recomputed from txs against the viewed plan)', () => {
    renderView();
    expect(screen.getByTestId('budget-total-spent').textContent).toBe('GHS 200');
  });

  it('shows all category names', () => {
    renderView();
    expect(screen.getByText('Groceries')).toBeTruthy();
    expect(screen.getByText('Transport')).toBeTruthy();
  });

  it('shows error state when error set', () => {
    mockFinance.error = 'Failed to load';
    renderView();
    expect(screen.getByText(/Failed to load/)).toBeTruthy();
    mockFinance.error = null;
  });

  it('sorts categories by pctUsed descending — most urgent first', () => {
    renderView();
    const rows = screen.getAllByText(/Groceries|Transport/);
    expect(rows[0].textContent).toContain('Groceries');   // 200/500 = 40% > Transport 0%
  });

  // ── Category cap (CAT01) ──────────────────────────────────────────────────
  it('free under cap: shows "N of 10" and the add button (no upgrade)', () => {
    renderView();   // default 2 categories, free
    expect(screen.getByTestId('category-count').textContent).toBe('2 of 10');
    expect(screen.getByText('+ Add budget category')).toBeTruthy();
    expect(screen.queryByTestId('upgrade-categories-btn')).toBeNull();
  });

  it('free at cap (10 categories): shows Upgrade to Pro and opens the modal', () => {
    mockBudgetCentre.allCategories = Array.from({ length: 10 }, (_, i) => ({
      id: `c${i}`, name: `Cat ${i}`, icon: '🛒', budget_amount: 10, is_fixed: true,
      sort_order: i, month: getCurrentMonth(), cycle_id: 'cyc-this',
    }));
    renderView();
    expect(screen.getByTestId('category-count').textContent).toBe('10 of 10');
    expect(screen.queryByText('+ Add budget category')).toBeNull();
    fireEvent.click(screen.getByTestId('upgrade-categories-btn'));
    expect(screen.getByText(/category limit for this period/)).toBeTruthy();   // UpgradeModal body
    resetCats();
  });

  // ── Phase 2C budget rollforward empty-state ───────────────────────────────
  it('rollforward State 3: shows "Yes, copy N categories" when the previous period had categories', () => {
    mockBudgetCentre.allCategories       = [];
    mockBudgetCentre.prevMonthCategories = mockPrevMonthCategories;   // 3 categories
    renderView();
    expect(screen.getByText(/Budget same as/)).toBeTruthy();
    expect(screen.getByTestId('copy-all-categories-btn').textContent).toBe('Yes, copy 3 categories');
    expect(screen.getByTestId('choose-which-categories-btn')).toBeTruthy();
    resetCats();
  });

  it('rollforward State 1: an empty previous period shows add-only (no copy CTA)', () => {
    mockBudgetCentre.allCategories       = [];
    mockBudgetCentre.prevMonthCategories = [];
    renderView();
    expect(screen.getByText(/No budget set for/)).toBeTruthy();
    expect(screen.queryByTestId('copy-all-categories-btn')).toBeNull();
    expect(screen.getByTestId('add-category-manually-btn')).toBeTruthy();
    resetCats();
  });

  it('loads the previous period\'s categories when the current budget is empty', async () => {
    const loadFn = vi.fn().mockResolvedValue({ data: mockPrevMonthCategories, error: null });
    mockBudgetCentre.allCategories           = [];
    mockBudgetCentre.prevMonthCategories     = mockPrevMonthCategories;
    mockBudgetCentre.loadPrevMonthCategories = loadFn;
    renderView();
    const prevMonth = offsetMonth(getCurrentMonth(), -1);
    await waitFor(() => expect(loadFn).toHaveBeenCalledWith(prevMonth));
    mockBudgetCentre.loadPrevMonthCategories = vi.fn().mockResolvedValue({ data: [], error: null });
    resetCats();
  });

  it('tapping "Yes, copy N" on the current period copies immediately (prevMonth → viewedMonth, no modal)', async () => {
    const copyFn = vi.fn().mockResolvedValue({ data: [{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }], error: null });
    mockBudgetCentre.allCategories         = [];
    mockBudgetCentre.prevMonthCategories   = mockPrevMonthCategories;
    mockBudgetCentre.copyCategoriesToMonth = copyFn;
    renderView();
    fireEvent.click(screen.getByTestId('copy-all-categories-btn'));
    const currentMonth = getCurrentMonth();
    const prevMonth    = offsetMonth(currentMonth, -1);
    await waitFor(() => expect(copyFn).toHaveBeenCalledWith(prevMonth, currentMonth, undefined, 'cyc-this'));
    mockBudgetCentre.copyCategoriesToMonth = vi.fn().mockResolvedValue({ data: [], error: null });
    resetCats();
  });

  it('tapping "Choose which to copy" opens the multi-select sheet', () => {
    mockBudgetCentre.allCategories       = [];
    mockBudgetCentre.prevMonthCategories = mockPrevMonthCategories;
    renderView();
    fireEvent.click(screen.getByTestId('choose-which-categories-btn'));
    expect(screen.getByTestId('copy-categories-sheet')).toBeTruthy();
    resetCats();
  });

  // ── Phase B period creator ────────────────────────────────────────────────
  it('the always-visible header button opens the budget-period creator', () => {
    renderView();
    expect(screen.queryByTestId('create-period-sheet')).toBeNull();
    fireEvent.click(screen.getByTestId('new-period-btn'));
    expect(screen.getByTestId('create-period-sheet')).toBeTruthy();
  });

  it('hides the no-current-period prompt while a live cycle covers today', () => {
    renderView();   // default mockFinance has the current-month cycle
    expect(screen.queryByTestId('no-current-period-prompt')).toBeNull();
  });

  // ── Cold-load flash gate (cyclesLoading) ──────────────────────────────────────
  it('renders nothing while cycles are loading', () => {
    mockFinance.cyclesLoading = true;
    const { container } = renderView();
    expect(container.firstChild).toBeNull();
    mockFinance.cyclesLoading = false;
  });

  it('does NOT flash the period creator while cycles are loading', () => {
    // No cycles yet — BudgetPeriodCreator would mount NoCurrentPeriodPrompt; the gate
    // must suppress the whole view so neither the prompt nor empty categories flash.
    mockFinance.cyclesLoading = true;
    mockFinance.cycles = [];
    renderView();
    expect(screen.queryByTestId('no-current-period-prompt')).toBeNull();
    expect(screen.queryByTestId('new-period-btn')).toBeNull();
    mockFinance.cyclesLoading = false;
    mockFinance.cycles = [THIS_CYCLE];
  });
});

// ── Cycle navigation, viewed-cycle data, and the past-period guard (Commit 8) ──
describe('BudgetView — cycles', () => {
  const MAY  = { id: 'cyc-may',  name: 'May 2026',     start_date: '2026-05-01', end_date: '2026-05-31', deleted_at: null };
  const APR  = { id: 'cyc-apr',  name: 'April 2026',   start_date: '2026-04-01', end_date: '2026-04-30', deleted_at: null };
  const PAST = { id: 'cyc-2020', name: 'January 2020', start_date: '2020-01-01', end_date: '2020-01-31', deleted_at: null };

  const setFinance = (over) => Object.assign(mockFinance, { cycles: [], activeCycle: null, activeCycleId: null, loadCycle: vi.fn(), txs: [], ...over });
  const reset = () => {
    Object.assign(mockFinance, { cycles: [], activeCycle: null, activeCycleId: null, loadCycle: vi.fn(), txs: mockTxs });
    resetCats();
  };
  afterEach(reset);

  it('labels the header with the viewed cycle name', () => {
    mockBudgetCentre.allCategories = [{ id: 'm1', name: 'Rent', icon: '🏠', budget_amount: 1000, is_fixed: true, sort_order: 0, month: '2026-05', cycle_id: 'cyc-may' }];
    setFinance({ cycles: [MAY, APR], activeCycle: MAY });
    renderView();
    expect(screen.getByTestId('budget-period-label').textContent).toBe('May 2026');
  });

  it('Next disabled on the latest cycle; Prev navigates to the older cycle', () => {
    mockBudgetCentre.allCategories = [{ id: 'm1', name: 'Rent', icon: '🏠', budget_amount: 1000, is_fixed: true, sort_order: 0, month: '2026-05', cycle_id: 'cyc-may' }];
    setFinance({ cycles: [MAY, APR], activeCycle: MAY });
    renderView();
    expect(screen.getByLabelText('Next period').disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Previous period'));
    expect(mockFinance.loadCycle).toHaveBeenCalledWith('cyc-apr');
  });

  it('viewedCategories is the viewed cycle\'s slice — filters other months and soft-deleted rows', () => {
    mockBudgetCentre.allCategories = [
      { id: 'm-may',  name: 'May Rent',   icon: '🏠', budget_amount: 1000, is_fixed: true, sort_order: 0, month: '2026-05', cycle_id: 'cyc-may' },
      { id: 'm-apr',  name: 'April Rent', icon: '🏠', budget_amount: 900,  is_fixed: true, sort_order: 0, month: '2026-04', cycle_id: 'cyc-apr' },
      { id: 'm-del',  name: 'Deleted',    icon: '🗑️', budget_amount: 50,   is_fixed: true, sort_order: 1, month: '2026-05', cycle_id: 'cyc-may', deleted_at: '2026-05-02' },
    ];
    setFinance({ cycles: [MAY, APR], activeCycleId: 'cyc-may', activeCycle: MAY });
    renderView();
    expect(screen.getByText('May Rent')).toBeTruthy();
    expect(screen.queryByText('April Rent')).toBeNull();   // other month excluded
    expect(screen.queryByText('Deleted')).toBeNull();      // soft-deleted excluded
    expect(screen.getByTestId('budget-total-planned').textContent).toBe('GHS 1,000');  // only May, not 1900
  });

  // Regression: the cross-view sync bug the Commit-0 band-aid masked. Viewing a past
  // cycle must show THAT cycle's plan, not the current month's, and must not reset.
  it('viewing a past cycle shows that cycle\'s plan, not the current month (band-aid gone)', () => {
    mockBudgetCentre.allCategories = [
      { id: 'm-may',  name: 'May Only',  icon: '🏠', budget_amount: 1000, is_fixed: true, sort_order: 0, month: '2026-05', cycle_id: 'cyc-may' },
      { id: 'm-jun',  name: 'June Only', icon: '🏠', budget_amount: 1200, is_fixed: true, sort_order: 0, month: '2026-06', cycle_id: 'cyc-jun' },
    ];
    // today is June; viewing May (a past cycle)
    setFinance({ cycles: [{ id: 'cyc-jun', name: 'June 2026', start_date: '2026-06-01', end_date: '2026-06-30', deleted_at: null }, MAY], activeCycleId: 'cyc-may', activeCycle: { id: 'cyc-jun', name: 'June 2026', start_date: '2026-06-01', end_date: '2026-06-30', deleted_at: null } });
    renderView();
    expect(screen.getByTestId('budget-period-label').textContent).toBe('May 2026');
    expect(screen.getByText('May Only')).toBeTruthy();
    expect(screen.queryByText('June Only')).toBeNull();
  });

  // ── Past-period mutation guard ──────────────────────────────────────────────
  it('adding on a past cycle opens the confirm modal instead of the add sheet', () => {
    mockBudgetCentre.allCategories = [{ id: 'p1', name: 'Old Cat', icon: '🏠', budget_amount: 100, is_fixed: true, sort_order: 0, month: '2020-01', cycle_id: 'cyc-2020' }];
    setFinance({ cycles: [PAST], activeCycleId: 'cyc-2020', activeCycle: PAST });
    renderView();
    fireEvent.click(screen.getByText('+ Add budget category'));
    expect(screen.getByText('Edit past period?')).toBeTruthy();
    expect(screen.getByText(/changing January 2020, which has ended/)).toBeTruthy();
    // the add sheet itself has NOT opened yet
    expect(screen.queryByText('Add Budget Category')).toBeNull();
  });

  it('Cancel on the guard aborts — no sheet, no mutation', () => {
    mockBudgetCentre.allCategories = [{ id: 'p1', name: 'Old Cat', icon: '🏠', budget_amount: 100, is_fixed: true, sort_order: 0, month: '2020-01', cycle_id: 'cyc-2020' }];
    setFinance({ cycles: [PAST], activeCycleId: 'cyc-2020', activeCycle: PAST });
    renderView();
    fireEvent.click(screen.getByText('+ Add budget category'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Edit past period?')).toBeNull();
    expect(screen.queryByText('Add Budget Category')).toBeNull();
  });

  it('Continue on the guard proceeds — opens the add sheet', () => {
    mockBudgetCentre.allCategories = [{ id: 'p1', name: 'Old Cat', icon: '🏠', budget_amount: 100, is_fixed: true, sort_order: 0, month: '2020-01', cycle_id: 'cyc-2020' }];
    setFinance({ cycles: [PAST], activeCycleId: 'cyc-2020', activeCycle: PAST });
    renderView();
    fireEvent.click(screen.getByText('+ Add budget category'));
    fireEvent.click(screen.getByText('Continue'));
    expect(screen.queryByText('Edit past period?')).toBeNull();
    expect(screen.getByText('Add Budget Category')).toBeTruthy();   // sheet now open
  });
});

// ── Reset budget period + standard-member RBAC gate ───────────────────────────
describe('BudgetView — reset period + RBAC gate', () => {
  const FUTURE = { id: 'cyc-fut', name: 'Future 2099', start_date: '2099-01-01', end_date: '2099-01-31', deleted_at: null };

  beforeEach(() => {
    mockCan = () => true;
    Object.assign(mockFinance, { cycles: [FUTURE], activeCycle: FUTURE, activeCycleId: null });
    mockBudgetCentre.allCategories = [];   // empty future period (kebab tests don't need rows)
  });
  afterEach(() => {
    mockCan = () => true;
    Object.assign(mockFinance, { cycles: [THIS_CYCLE], activeCycle: THIS_CYCLE, activeCycleId: null });
    mockBudgetCentre.allCategories = mockCategories;
  });

  it('shows the period-actions kebab on a future period', () => {
    renderView();
    expect(screen.getByTestId('period-actions-btn')).toBeTruthy();
  });

  it('does NOT show the kebab on the current period', () => {
    Object.assign(mockFinance, { cycles: [THIS_CYCLE], activeCycle: THIS_CYCLE });
    renderView();
    expect(screen.queryByTestId('period-actions-btn')).toBeNull();
  });

  it('opening the kebab and tapping Reset opens the reset confirm naming the period', () => {
    renderView();
    fireEvent.click(screen.getByTestId('period-actions-btn'));
    fireEvent.click(screen.getByTestId('reset-period-btn'));
    expect(screen.getByText('Reset Future 2099?')).toBeTruthy();
  });

  it('confirming the reset calls resetPeriod with the future cycle id', async () => {
    const resetPeriod = vi.fn().mockResolvedValue({ data: { categories_reset: 1, transactions_reset: 0 }, error: null });
    mockFinance.resetPeriod = resetPeriod;
    renderView();
    fireEvent.click(screen.getByTestId('period-actions-btn'));
    fireEvent.click(screen.getByTestId('reset-period-btn'));
    fireEvent.click(screen.getByText('Reset'));   // confirm
    await waitFor(() => expect(resetPeriod).toHaveBeenCalledWith('cyc-fut'));
  });

  it('standard member: the New budget period button is disabled', () => {
    mockCan = () => false;
    renderView();
    expect(screen.getByTestId('new-period-btn').disabled).toBe(true);
  });

  it('standard member: the Reset kebab item is disabled', () => {
    mockCan = () => false;
    renderView();
    fireEvent.click(screen.getByTestId('period-actions-btn'));
    expect(screen.getByTestId('reset-period-btn').disabled).toBe(true);
  });
});

// ── History visibility gate — at-wall upgrade affordance (D5/D6/D8) ────────────
describe('BudgetView — history gate at-wall affordance', () => {
  const JUN = { id: 'cyc-jun', name: 'June 2026',  start_date: '2026-06-01', end_date: '2026-06-30', deleted_at: null };
  const MAY = { id: 'cyc-may', name: 'May 2026',   start_date: '2026-05-01', end_date: '2026-05-31', deleted_at: null };
  const APR = { id: 'cyc-apr', name: 'April 2026', start_date: '2026-04-01', end_date: '2026-04-30', deleted_at: null };
  const MAR = { id: 'cyc-mar', name: 'March 2026', start_date: '2026-03-01', end_date: '2026-03-31', deleted_at: null };

  beforeEach(() => {
    mockCan = () => true;
    mockBudgetCentre.allCategories = [];   // empty viewed cycle — header still renders
  });
  afterEach(() => {
    mockCan = () => true;
    Object.assign(mockFinance, { cycles: [THIS_CYCLE], activeCycle: THIS_CYCLE, activeCycleId: null, userPlan: 'free' });
    mockFinance.visibleCycles = undefined;   // back to "defaults to cycles" in the mock factory
    mockBudgetCentre.allCategories = mockCategories;
  });

  it('free + hidden cycles + on oldest visible: prev arrow is a tappable upgrade affordance that opens the modal', () => {
    // 4 cycles total, free window = 3 (Jun/May/Apr); viewing Apr (oldest visible) → Mar hidden.
    Object.assign(mockFinance, { cycles: [JUN, MAY, APR, MAR], visibleCycles: [JUN, MAY, APR], activeCycle: JUN, activeCycleId: 'cyc-apr', userPlan: 'free' });
    renderView();
    const affordance = screen.getByTestId('upgrade-history-affordance');
    expect(affordance.disabled).toBe(false);            // tappable, not disabled
    fireEvent.click(affordance);
    expect(screen.getByText(/history limit/)).toBeTruthy();   // HISTORY_CAP_BODY in the UpgradeModal
  });

  it('Pro at the hub natural oldest: normal disabled prev, no affordance', () => {
    // Pro sees all; visibleCycles === cycles → nothing hidden.
    Object.assign(mockFinance, { cycles: [JUN, MAY, APR], visibleCycles: [JUN, MAY, APR], activeCycle: JUN, activeCycleId: 'cyc-apr', userPlan: 'pro' });
    renderView();
    expect(screen.queryByTestId('upgrade-history-affordance')).toBeNull();
    expect(screen.getByLabelText('Previous period').disabled).toBe(true);
  });

  it('free with ≤3 cycles total: no hidden history → normal disabled prev, no affordance', () => {
    Object.assign(mockFinance, { cycles: [MAY, APR], visibleCycles: [MAY, APR], activeCycle: MAY, activeCycleId: 'cyc-apr', userPlan: 'free' });
    renderView();
    expect(screen.queryByTestId('upgrade-history-affordance')).toBeNull();
    expect(screen.getByLabelText('Previous period').disabled).toBe(true);
  });
});
