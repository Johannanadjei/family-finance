/**
 * components/PeriodSetupPrompt.test.jsx
 *
 * The three states and the rules that keep them apart:
 *   A receipt  — ONLY when auto-continue actually created a month this session
 *   B setup    — no month covers today AND the viewer can manage months
 *   C ask      — no month covers today AND the viewer cannot
 *
 * "Today" is the real system clock, so cases are built around it: a cycle spanning a
 * wide window always contains today; a clearly past cycle never does.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PeriodSetupPrompt } from './PeriodSetupPrompt';
import { mockCentre } from '../test-utils/fixtures';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => mockNavigate }));

let mockCan;
vi.mock('../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({ centre: mockCentre, can: (p) => mockCan(p) }),
}));

let mockFinance;
vi.mock('../context/FinanceContext', () => ({
  useFinanceContext: () => mockFinance,
}));

// Wide enough to always contain "today" whenever the suite runs.
const ALWAYS_NOW = { id: 'now', name: 'This Month', start_date: '2000-01-01', end_date: '2099-12-31', deleted_at: null };
const LONG_PAST  = { id: 'old', name: 'August 2026', start_date: '2000-01-01', end_date: '2000-12-31', deleted_at: null };

const RECEIPT = {
  cycleId: 'cyc-sep', name: 'September 2026', startDate: '2026-09-01', endDate: '2026-09-30',
  sourceCycleId: 'old', categoriesCarried: 5, categoriesSkipped: 0,
  incomeCarried: 2, incomeSkipped: 0, tier: 'free',
};

const renderIt = () => render(<PeriodSetupPrompt />);

beforeEach(() => {
  localStorage.clear();
  mockNavigate.mockClear();
  mockCan = () => true;                                  // owner by default
  mockFinance = {
    cycles: [LONG_PAST], cyclesLoading: false, autoPeriod: null,
    dismissAutoPeriod: vi.fn(),
    ensurePeriodNow: vi.fn().mockResolvedValue({ data: { created: true }, error: null }),
  };
});

// ── Nothing to say ───────────────────────────────────────────────────────────
describe('PeriodSetupPrompt — silence', () => {
  it('renders nothing when a month covers today and there is no receipt', () => {
    mockFinance.cycles = [ALWAYS_NOW];
    const { container } = renderIt();
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing while the month list is still loading', () => {
    mockFinance.cyclesLoading = true;                     // cycles=[LONG_PAST] would show setup
    const { container } = renderIt();
    expect(container.firstChild).toBeNull();
  });

  it('ignores a soft-deleted month that would otherwise cover today', () => {
    mockFinance.cycles = [{ ...ALWAYS_NOW, deleted_at: '2020-01-01T00:00:00Z' }];
    renderIt();
    expect(screen.getByTestId('period-setup')).toBeTruthy();
  });
});

// ── A. Receipt — created:true ONLY ───────────────────────────────────────────
describe('PeriodSetupPrompt — A: carry-over receipt', () => {
  it('shows the receipt naming the new month and the month it carried from', () => {
    mockFinance.cycles = [ALWAYS_NOW, LONG_PAST];
    mockFinance.autoPeriod = RECEIPT;
    renderIt();
    expect(screen.getByTestId('period-receipt')).toBeTruthy();
    expect(screen.getByText('September 2026 started')).toBeTruthy();
    expect(screen.getByText(/carried over from August 2026/)).toBeTruthy();
  });

  // THE rule. The hook sets autoPeriod on the created===true branch only, so a
  // created:false result (a racer created the month first) leaves it null and this
  // component has nothing to show — it never claims credit for someone else's write.
  it('shows NO receipt when nothing was created (autoPeriod null on created:false)', () => {
    mockFinance.cycles = [ALWAYS_NOW];
    mockFinance.autoPeriod = null;                        // what created:false leaves behind
    const { container } = renderIt();
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('period-receipt')).toBeNull();
  });

  it('reads neutral, not as a warning (no danger/warning border)', () => {
    mockFinance.cycles = [ALWAYS_NOW, LONG_PAST];
    mockFinance.autoPeriod = RECEIPT;
    renderIt();
    const border = screen.getByTestId('period-receipt').style.border;
    expect(border).not.toContain('danger');
    expect(border).not.toContain('warning');
  });

  it('says the budget is ready to set up when there was no month to carry from', () => {
    mockFinance.cycles = [ALWAYS_NOW];
    mockFinance.autoPeriod = { ...RECEIPT, sourceCycleId: null, categoriesCarried: 0, incomeCarried: 0 };
    renderIt();
    expect(screen.getByText(/ready to set up/)).toBeTruthy();
    expect(screen.queryByText(/carried over from/)).toBeNull();
  });

  it('reports what the tier cap left behind', () => {
    mockFinance.cycles = [ALWAYS_NOW, LONG_PAST];
    mockFinance.autoPeriod = { ...RECEIPT, categoriesSkipped: 3, incomeSkipped: 1 };
    renderIt();
    expect(screen.getByTestId('receipt-skipped').textContent).toContain('3 categories');
    expect(screen.getByTestId('receipt-skipped').textContent).toContain('1 income sources');
  });

  it('Review opens the month on Budget', () => {
    mockFinance.cycles = [ALWAYS_NOW, LONG_PAST];
    mockFinance.autoPeriod = RECEIPT;
    renderIt();
    fireEvent.click(screen.getByTestId('receipt-review'));
    expect(mockNavigate).toHaveBeenCalledWith('/budget');
  });

  it('dismissing clears it and persists per hub + month', () => {
    mockFinance.cycles = [ALWAYS_NOW, LONG_PAST];
    mockFinance.autoPeriod = RECEIPT;
    const { unmount } = renderIt();
    fireEvent.click(screen.getByTestId('receipt-dismiss'));
    expect(mockFinance.dismissAutoPeriod).toHaveBeenCalledTimes(1);

    // Remount with the receipt still in state (as a fresh mount on another view
    // would see it): the persisted dismissal keeps it hidden.
    unmount();
    renderIt();
    expect(screen.queryByTestId('period-receipt')).toBeNull();
  });

  it('a dismissal is scoped to its own month — the next month still reports', () => {
    mockFinance.cycles = [ALWAYS_NOW, LONG_PAST];
    mockFinance.autoPeriod = RECEIPT;
    const first = renderIt();
    fireEvent.click(screen.getByTestId('receipt-dismiss'));
    first.unmount();

    mockFinance.autoPeriod = { ...RECEIPT, name: 'October 2026', startDate: '2026-10-01' };
    renderIt();
    expect(screen.getByTestId('period-receipt')).toBeTruthy();
    expect(screen.getByText('October 2026 started')).toBeTruthy();
  });
});

// ── B. Owner setup ───────────────────────────────────────────────────────────
describe('PeriodSetupPrompt — B: owner setup', () => {
  it('offers a one-tap start for the month containing today', () => {
    renderIt();
    expect(screen.getByTestId('period-setup')).toBeTruthy();
    expect(screen.getByTestId('period-setup-cta').textContent).toMatch(/^Set up /);
  });

  it('names the month it will carry the budget over from', () => {
    renderIt();
    expect(screen.getByText(/Carry your budget over from August 2026/)).toBeTruthy();
  });

  it('offers plain setup wording when the hub has no earlier month', () => {
    mockFinance.cycles = [];
    renderIt();
    expect(screen.getByText(/Set up this month’s budget/)).toBeTruthy();
  });

  // One tap runs the SAME server write auto-continue would have — so the month is
  // clipped to the real gap and the previous budget still carries over. No date picker.
  it('the CTA runs ensurePeriodNow', async () => {
    renderIt();
    fireEvent.click(screen.getByTestId('period-setup-cta'));
    await waitFor(() => expect(mockFinance.ensurePeriodNow).toHaveBeenCalledTimes(1));
  });

  it('surfaces a failure instead of pretending it worked', async () => {
    mockFinance.ensurePeriodNow = vi.fn().mockResolvedValue({ data: null, error: { message: 'nope' } });
    renderIt();
    fireEvent.click(screen.getByTestId('period-setup-cta'));
    expect(await screen.findByTestId('period-setup-error')).toBeTruthy();
  });

  // The sheet's open flag is lifted into BudgetView, so the ask travels as router
  // state and BudgetPeriodCreator raises the sheet on arrival.
  it('"Choose different dates" routes to Budget asking for the custom creator', () => {
    renderIt();
    fireEvent.click(screen.getByTestId('period-choose-dates'));
    expect(mockNavigate).toHaveBeenCalledWith('/budget', { state: { openPeriodCreator: true } });
  });
});

// ── C. Standard member ───────────────────────────────────────────────────────
describe('PeriodSetupPrompt — C: ask the owner', () => {
  beforeEach(() => { mockCan = (p) => p !== 'manageCycles'; });

  it('tells a standard member to ask the owner, with no button', () => {
    renderIt();
    expect(screen.getByTestId('period-ask-owner')).toBeTruthy();
    expect(screen.getByText(/Ask the hub owner to start this month/)).toBeTruthy();
    expect(screen.queryByTestId('period-setup-cta')).toBeNull();
    expect(screen.queryByTestId('period-choose-dates')).toBeNull();
  });

  it('never offers the setup state to someone the server would refuse', () => {
    renderIt();
    expect(screen.queryByTestId('period-setup')).toBeNull();
  });

  // A standard member can still SEE that the month was started for the hub.
  it('still shows the receipt when the hub got a month', () => {
    mockFinance.cycles = [ALWAYS_NOW, LONG_PAST];
    mockFinance.autoPeriod = RECEIPT;
    renderIt();
    expect(screen.getByTestId('period-receipt')).toBeTruthy();
  });
});
