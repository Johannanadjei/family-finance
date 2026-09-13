/**
 * features/onboarding/OnboardingFlow.test.jsx
 *
 * Focus (Commit 14b): the first-cycle CYC02 closure — onboarding must create the
 * hub's first cycle BEFORE bulk-inserting categories/income, and stamp those rows
 * with the cycle's id. Walks the 5-step flow with the minimal valid input.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { OnboardingFlow } from './OnboardingFlow';

// Inert Supabase stub — OnboardingFlow no longer touches the client (the tier now
// arrives as a prop from App.jsx), but a transitive import must never construct a
// real client. Any read through this stub would throw, which is the point.
vi.mock('../../lib/supabase', () => ({
  supabase: { auth: {}, from: () => ({}), rpc: () => ({}) },
}));
vi.mock('../../services/centres.service', () => ({
  createCentre: vi.fn().mockResolvedValue({ data: { id: 'c-new' }, error: null }),
}));
vi.mock('../../services/categories.service', () => ({
  bulkAddCategories: vi.fn().mockResolvedValue({ error: null }),
}));
vi.mock('../../services/income.service', () => ({
  bulkAddIncomeSources: vi.fn().mockResolvedValue({ error: null }),
}));
// create_budget_period RETURNS budget_cycles, so the mock returns a realistic ROW —
// not just an id. Income's `month` is derived from this row's start_date, so an
// id-only mock would hide that derivation (and crash the flow).
vi.mock('../../services/cycles.service', () => ({
  createBudgetPeriod: vi.fn().mockResolvedValue({
    data: { id: 'cyc-new', name: 'March 2026', start_date: '2026-03-01', end_date: '2026-03-31', deleted_at: null },
    error: null,
  }),
}));

import { createCentre }        from '../../services/centres.service';
import { createBudgetPeriod }   from '../../services/cycles.service';
import { bulkAddCategories }    from '../../services/categories.service';
import { bulkAddIncomeSources } from '../../services/income.service';

beforeEach(() => { vi.clearAllMocks(); });

// Walk steps 0→3 with minimal valid input, leaving step 4 (Complete) on screen.
const walkToConfirm = () => {
  fireEvent.change(screen.getByPlaceholderText("e.g. The Adjei's"), { target: { value: 'My Hub' } });
  fireEvent.click(screen.getByText('Continue →'));     // step 0 → 1
  fireEvent.click(screen.getByText('Skip for now'));   // step 1 (income) → 2
  fireEvent.click(screen.getByText('Continue →'));     // step 2 (categories) → 3
  fireEvent.click(screen.getByText('Continue →'));     // step 3 (target) → 4
};

// Phase B (anchor pivot): onboarding creates the hub's first budget period via the
// user-driven create_budget_period RPC (a calendar-month default for today, Decision Q3)
// BEFORE bulk-inserting categories/income, and stamps those rows with the new cycle id.
describe('OnboardingFlow — first-cycle CYC02 closure', () => {
  it('creates the first budget period before bulk-inserting, stamped with its id', async () => {
    render(<OnboardingFlow onComplete={vi.fn()} />);
    walkToConfirm();
    await act(async () => { fireEvent.click(screen.getByText(/Create BOS Hub/)); });

    expect(createCentre).toHaveBeenCalledWith(expect.objectContaining({ name: 'My Hub' }));
    expect(createBudgetPeriod).toHaveBeenCalledWith('c-new', expect.objectContaining({
      startDate: expect.stringMatching(/^\d{4}-\d{2}-01$/),   // first of a calendar month
      endDate:   expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    }));
    expect(bulkAddCategories).toHaveBeenCalledWith('c-new', expect.anything(), 'cyc-new');
    expect(bulkAddIncomeSources).toHaveBeenCalledWith('c-new', expect.anything(), 'cyc-new');
  });

  // The clock leak this workstream closed: income's `month` used to come from
  // getCurrentMonth() while its cycle_id came from the period just created. On any
  // hub whose first period is not the current calendar month those two disagreed
  // from the very first write. The period's start_date is the only source now.
  it("derives income's month from the created PERIOD, not from today's clock", async () => {
    render(<OnboardingFlow onComplete={vi.fn()} />);
    // Seed one income source so there is a real row to inspect (walkToConfirm skips
    // the income step entirely, which would leave an empty array and a vacuous assert).
    fireEvent.change(screen.getByPlaceholderText("e.g. The Adjei's"), { target: { value: 'My Hub' } });
    fireEvent.click(screen.getByText('Continue →'));                 // step 0 → 1
    // The step starts with one blank stream — fill it rather than adding a second.
    // validateIncomeStep requires BOTH a name and an amount > 0.
    fireEvent.change(screen.getAllByPlaceholderText('e.g. Salary, Freelance')[0], { target: { value: 'Salary' } });
    fireEvent.change(screen.getAllByPlaceholderText('Expected amount')[0], { target: { value: '5000' } });
    fireEvent.click(screen.getByTestId('income-stream-continue-btn'));  // step 1 → 2
    fireEvent.click(screen.getByText('Continue →'));                 // step 2 → 3
    fireEvent.click(screen.getByText('Continue →'));                 // step 3 → 4
    await act(async () => { fireEvent.click(screen.getByText(/Create BOS Hub/)); });

    const [, incomeRows, cycleId] = bulkAddIncomeSources.mock.calls[0];
    expect(cycleId).toBe('cyc-new');
    expect(incomeRows.length).toBeGreaterThan(0);   // guard against a vacuous .every()
    // The mocked period starts in MARCH; the test clock is whatever today is. Every
    // income row must carry the period's month.
    expect(incomeRows.every(r => r.month === '2026-03')).toBe(true);
  });

  it('seeds exactly 10 default categories (trimmed 13→10 for the free cap)', async () => {
    render(<OnboardingFlow onComplete={vi.fn()} />);
    walkToConfirm();
    await act(async () => { fireEvent.click(screen.getByText(/Create BOS Hub/)); });
    const [, rows] = bulkAddCategories.mock.calls[0];
    expect(rows).toHaveLength(10);
  });

  it('completes onboarding after all writes succeed', async () => {
    const onComplete = vi.fn();
    render(<OnboardingFlow onComplete={onComplete} />);
    walkToConfirm();
    await act(async () => { fireEvent.click(screen.getByText(/Create BOS Hub/)); });
    expect(onComplete).toHaveBeenCalled();
  });

  it('aborts before bulk insert when the first period cannot be created', async () => {
    createBudgetPeriod.mockResolvedValueOnce({ data: null, error: { code: 'CYC01', message: 'overlap' } });
    render(<OnboardingFlow onComplete={vi.fn()} />);
    walkToConfirm();
    await act(async () => { fireEvent.click(screen.getByText(/Create BOS Hub/)); });
    expect(bulkAddCategories).not.toHaveBeenCalled();
  });

  // e2e/smoke-signin.spec.js asserts this testid to confirm the fresh fixture
  // lands on the onboarding gate. Renaming it must fail here first.
  it('exposes the onboarding-flow testid on the root', () => {
    render(<OnboardingFlow onComplete={vi.fn()} />);
    expect(screen.getByTestId('onboarding-flow')).toBeTruthy();
  });
});

// ── Tier threading ──────────────────────────────────────────────────────────
// The flow does not resolve the user's tier — App.jsx passes it in. It used to
// fetch users.plan itself, a column the subscriptions table replaced, so a paying
// user was silently onboarded under the FREE caps: 10 categories, 2 income streams,
// on the very hub they had paid to make bigger. These tests pin the seam.
describe('OnboardingFlow — tier threading', () => {
  const goToCategories = () => {
    fireEvent.change(screen.getByPlaceholderText("e.g. The Adjei's"), { target: { value: 'My Hub' } });
    fireEvent.click(screen.getByText('Continue →'));   // step 0 → 1
    fireEvent.click(screen.getByText('Skip for now')); // step 1 → 2
  };

  // The onboarding seed is exactly 10 categories — the free cap — so a Pro user
  // hits the gate on arrival at the step, before touching anything.
  it('pro: the categories step is uncapped at the 10 seeded defaults', () => {
    render(<OnboardingFlow onComplete={vi.fn()} plan="pro" />);
    goToCategories();
    expect(screen.getByTestId('onboarding-add-category-btn').disabled).toBe(false);
    expect(screen.queryByText(/Free hubs can have up to/)).toBeNull();
  });

  it('free: the categories step caps at the 10 seeded defaults', () => {
    render(<OnboardingFlow onComplete={vi.fn()} plan="free" />);
    goToCategories();
    expect(screen.getByTestId('onboarding-add-category-btn').disabled).toBe(true);
    expect(screen.getByText(/Free hubs can have up to 10 categories/)).toBeTruthy();
  });

  it('unresolved tier (null, the default): no cap renders on the categories step', () => {
    render(<OnboardingFlow onComplete={vi.fn()} />);
    goToCategories();
    expect(screen.getByTestId('onboarding-add-category-btn').disabled).toBe(false);
  });

  it('pro: the income step adds past the free limit of 2', () => {
    render(<OnboardingFlow onComplete={vi.fn()} plan="pro" />);
    fireEvent.change(screen.getByPlaceholderText("e.g. The Adjei's"), { target: { value: 'My Hub' } });
    fireEvent.click(screen.getByText('Continue →'));                    // step 0 → 1
    fireEvent.click(screen.getByTestId('income-stream-add-btn'));       // 1 → 2 streams
    fireEvent.click(screen.getByTestId('income-stream-add-btn'));       // 2 → 3 streams
    expect(screen.getAllByText(/Income Stream/)).toHaveLength(3);
    expect(screen.getByTestId('income-stream-add-btn')).toBeTruthy();
  });

  it('free: the income step stops at 2 streams with the upgrade note', () => {
    render(<OnboardingFlow onComplete={vi.fn()} plan="free" />);
    fireEvent.change(screen.getByPlaceholderText("e.g. The Adjei's"), { target: { value: 'My Hub' } });
    fireEvent.click(screen.getByText('Continue →'));
    fireEvent.click(screen.getByTestId('income-stream-add-btn'));       // 1 → 2 streams
    expect(screen.queryByTestId('income-stream-add-btn')).toBeNull();
    expect(screen.getByText(/Upgrade to Pro/)).toBeTruthy();
  });

  it('unresolved tier (null): the income step does not cap at 2 streams', () => {
    render(<OnboardingFlow onComplete={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("e.g. The Adjei's"), { target: { value: 'My Hub' } });
    fireEvent.click(screen.getByText('Continue →'));
    fireEvent.click(screen.getByTestId('income-stream-add-btn'));       // 1 → 2 streams
    expect(screen.getByTestId('income-stream-add-btn')).toBeTruthy();
    expect(screen.queryByText(/Upgrade to Pro/)).toBeNull();
  });
});
