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

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { plan: 'free' }, error: null }) }) }) }),
  },
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
vi.mock('../../services/cycles.service', () => ({
  createBudgetPeriod: vi.fn().mockResolvedValue({ data: { id: 'cyc-new' }, error: null }),
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
});
