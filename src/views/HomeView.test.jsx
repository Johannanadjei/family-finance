/**
 * views/HomeView.test.jsx
 * Reads financeValues from FinanceContext — no props.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter }             from 'react-router-dom';
import { HomeView }                 from './HomeView';
import { getCurrentMonth }          from '../lib/finance';
import { getToday }                 from '../lib/dates';
import { mockCentre, mockFmt }      from '../test-utils/fixtures';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => mockNavigate }));

const expectedMonthLabel = () => new Date(getCurrentMonth() + '-01')
  .toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

let mockCan = () => true;
vi.mock('../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({ centre: mockCentre, fmt: mockFmt, can: (p) => mockCan(p) }),
}));

const mockFinance = {
  loading:       false,
  cyclesLoading: false,
  totalReceived: 30000,
  allIncome:      45000,
  monthlyIncome: 45000,
  totalSpent:    5000,
  healthPct:     89,
  budgetStatus:  { label: 'On Track 🎯', color: '#059669' },
  nextUnpaid:    { id: 'inc-2', label: 'Dita Salary', expected_amount: 15000, daysUntil: 7 },
  totalExpected: 45000,
  fixedTotal:    28000,
  budgetRemaining: 23000,
  surplusTarget: 4500,
  spareMoney:    19600,
  // Cycle state — default no cycle so the label falls back to the current month and
  // the mount-reset is a no-op (existing tests unaffected). activeCycleId defaults null
  // (no navigation yet) — the guard's truthiness check makes the reset a no-op.
  activeCycle:   null,
  activeCycleId: null,
  activeMonth:   getCurrentMonth(),
  loadCycle:     vi.fn(),
  txs: [
    { id: 'tx-1', type: 'expense', amount: 200,   category_name: 'Groceries',    date: '2026-05-19', logged_by_name: 'Johannan' },
    { id: 'tx-2', type: 'income',  amount: 30000, category_name: 'Adjei Salary', date: '2026-05-19', logged_by_name: 'Johannan' },
  ],
};

vi.mock('../context/FinanceContext', () => ({
  useFinanceContext: () => mockFinance,
}));

const renderHome = () => render(<MemoryRouter><HomeView /></MemoryRouter>);

describe('HomeView', () => {
  beforeEach(() => { mockCan = () => true; });
  it('renders skeleton when loading', () => {
    mockFinance.loading = true;
    const { container } = renderHome();
    expect(container.firstChild).toBeTruthy();
    mockFinance.loading = false;
  });

  it('shows the current month label at the top of the view', () => {
    renderHome();
    expect(screen.getByTestId('home-month-label').textContent).toContain(expectedMonthLabel());
  });

  it('renders income received amount in income card', () => {
    renderHome();
    expect(screen.getByTestId('income-received-amount').textContent).toBe('GHS 45,000');
  });

  it('shows confirm income message when nothing received', () => {
    mockFinance.totalReceived = 0;
    mockFinance.allIncome = 0;
    renderHome();
    expect(screen.getByText('Log income in Payday or via + button')).toBeTruthy();
    mockFinance.totalReceived = 30000;
    mockFinance.allIncome = 45000;
  });

  it('renders budget health bar', () => {
    renderHome();
    expect(screen.getByText('Budget Health')).toBeTruthy();
    expect(screen.getByText('On Track 🎯')).toBeTruthy();
  });

  it('renders payday summary', () => {
    renderHome();
    expect(screen.getByText('💜 Payday Tracker')).toBeTruthy();
  });

  it('shows all received when all income confirmed', () => {
    mockFinance.totalReceived = 45000;
    mockFinance.totalExpected = 45000;
    mockFinance.nextUnpaid    = null;
    renderHome();
    expect(screen.getByText('All income received ✓')).toBeTruthy();
    mockFinance.totalReceived = 30000;
    mockFinance.totalExpected = 45000;
    mockFinance.nextUnpaid    = { id: 'inc-2', label: 'Dita Salary', expected_amount: 15000, daysUntil: 7 };
  });

  it('renders 3 stat card labels for owner/full_access', () => {
    renderHome();
    expect(screen.getByText('Money In')).toBeTruthy();
    expect(screen.getByText('Budget Left')).toBeTruthy();
    expect(screen.getByText('Spare Money')).toBeTruthy();
    expect(screen.queryByText('Variable Spent')).toBeNull();
    expect(screen.queryByText('Surplus Left')).toBeNull();
  });

  // F1 RLS audit (2026-07-12): this test previously asserted that a standard member
  // "sees only Spare Money" — encoding the leak as expected behaviour. Spare Money is
  // INCOME-DERIVED (allIncome − max(fixedTotal, budgetSpend) − spareSpend), so showing it
  // to a role with viewIncome:false disclosed a currency figure computed from the hub's
  // income. A standard member must now see NO money stat cards at all.
  it('standard member sees no stat cards — Spare Money is income-derived and gated', () => {
    mockCan = () => false;
    renderHome();
    expect(screen.queryByText('Money In')).toBeNull();
    expect(screen.queryByText('Budget Left')).toBeNull();
    expect(screen.queryByText('Spare Money')).toBeNull();
    // Month label is ungated — visible even without viewIncome permission
    expect(screen.getByTestId('home-month-label').textContent).toContain(expectedMonthLabel());
  });

  it('standard member sees no spare-money figure anywhere on Home', () => {
    mockCan = () => false;
    mockFinance.spareMoney = 19600;
    renderHome();
    // Belt and braces: the value itself must not reach the DOM by any route
    // (StatCard, hero mini-stat, or otherwise) for a role without viewBalance.
    expect(screen.queryByText('GHS 19,600')).toBeNull();
  });

  it('stat cards show formatted values', () => {
    renderHome();
    // Budget Left is unique to the StatCard (hero does not render budgetRemaining)
    expect(screen.getByText('GHS 23,000')).toBeTruthy();
    // Spare Money is rendered in both the hero mini-stat and the StatCard
    expect(screen.getAllByText('GHS 19,600').length).toBeGreaterThanOrEqual(2);
  });

  it('Spare Money StatCard uses danger colour when spareMoney is negative', () => {
    mockFinance.spareMoney = -500;
    renderHome();
    // The StatCard value sits next to a "Spare Money" label; find it via the label's parent.
    const spareLabel = screen.getByText('Spare Money');
    const card = spareLabel.closest('div').parentElement;
    const value = card.querySelector('p[style*="font-weight: 900"][style*="font-size: 20"]');
    expect(value).toBeTruthy();
    expect(value.style.color).toMatch(/dc2626|c-danger/);
    mockFinance.spareMoney = 19600;
  });



  it('renders recent activity', () => {
    renderHome();
    expect(screen.getByText('Recent Activity')).toBeTruthy();
    expect(screen.getByText('Groceries')).toBeTruthy();
  });

  it('shows empty state when no transactions', () => {
    mockFinance.txs = [];
    renderHome();
    expect(screen.getByText(/No transactions yet/)).toBeTruthy();
    mockFinance.txs = [
      { id: 'tx-1', type: 'expense', amount: 200, category_name: 'Groceries', date: '2026-05-19', logged_by_name: 'Johannan' },
    ];
  });

  // ── Cycles: current-cycle label + "now"-dashboard mount-reset (Commit 9) ──────
  const restoreCycle = () => { mockFinance.activeCycle = null; mockFinance.activeCycleId = null; mockFinance.activeMonth = getCurrentMonth(); mockFinance.loadCycle = vi.fn(); };

  it('labels the header with the active cycle name when one exists', () => {
    mockFinance.activeCycle = { id: 'cyc-may', name: 'May 2026', start_date: '2026-05-01', end_date: '2026-05-31' };
    mockFinance.activeMonth = '2026-05';   // matches → no reset
    renderHome();
    expect(screen.getByTestId('home-month-label').textContent).toBe('May 2026');
    restoreCycle();
  });

  it('snaps the shared selection to the current cycle when loaded data has drifted', () => {
    // Another view navigated to a past cycle → activeCycleId points away from the
    // current (auto-resolved) activeCycle. Drift is the activeCycleId mismatch, not month.
    mockFinance.activeCycle   = { id: 'cyc-jun', name: 'June 2026', start_date: '2026-06-01', end_date: '2026-06-30' };
    mockFinance.activeCycleId = 'cyc-may';   // explicit past-cycle selection → drifted
    const loadCycle = vi.fn();
    mockFinance.loadCycle = loadCycle;
    renderHome();
    expect(loadCycle).toHaveBeenCalledWith('cyc-jun');
    restoreCycle();
  });

  it('does NOT reset when the loaded data already matches the current cycle', () => {
    mockFinance.activeCycle   = { id: 'cyc-apr', name: 'April 2026', start_date: '2026-04-01', end_date: '2026-04-30' };
    mockFinance.activeCycleId = 'cyc-apr';   // selection matches the active cycle
    const loadCycle = vi.fn();
    mockFinance.loadCycle = loadCycle;
    renderHome();
    expect(loadCycle).not.toHaveBeenCalled();
    restoreCycle();
  });

  it('does NOT reset when there are no cycles (brand-new hub)', () => {
    mockFinance.activeCycle = null;
    const loadCycle = vi.fn();
    mockFinance.loadCycle = loadCycle;
    renderHome();
    expect(loadCycle).not.toHaveBeenCalled();
    restoreCycle();
  });

  // ── Passive "no current period" prompt (Phase B) ──────────────────────────────
  it('shows the no-current-period prompt when no live cycle covers today', () => {
    mockFinance.cycles = [];   // brand-new / lapsed hub
    renderHome();
    expect(screen.getByTestId('no-current-period-prompt')).toBeTruthy();
    mockFinance.cycles = undefined;
  });

  it('hides the prompt when a live cycle covers today', () => {
    const today = getToday();
    mockFinance.cycles = [{ id: 'now', start_date: today, end_date: today, deleted_at: null }];
    renderHome();
    expect(screen.queryByTestId('no-current-period-prompt')).toBeNull();
    mockFinance.cycles = undefined;
  });

  it('routes to /budget when the prompt CTA is tapped', () => {
    mockFinance.cycles = [];
    mockNavigate.mockClear();
    renderHome();
    fireEvent.click(screen.getByTestId('create-period-cta'));
    expect(mockNavigate).toHaveBeenCalledWith('/budget');
    mockFinance.cycles = undefined;
  });

  // ── Cold-load flash gate (cyclesLoading) ──────────────────────────────────────
  it('renders nothing while cycles are loading', () => {
    mockFinance.cyclesLoading = true;
    const { container } = renderHome();
    expect(container.firstChild).toBeNull();
    mockFinance.cyclesLoading = false;
  });

  it('does NOT flash the no-current-period prompt while cycles are loading', () => {
    // cycles=[] would normally show the prompt — the gate must suppress it until
    // cycles resolve, so the cold-load flash never paints the banner.
    mockFinance.cyclesLoading = true;
    mockFinance.cycles = [];
    renderHome();
    expect(screen.queryByTestId('no-current-period-prompt')).toBeNull();
    mockFinance.cyclesLoading = false;
    mockFinance.cycles = undefined;
  });

  it('renders real content once cycles have loaded', () => {
    mockFinance.cyclesLoading = false;
    renderHome();
    expect(screen.getByTestId('home-month-label')).toBeTruthy();
  });
});
