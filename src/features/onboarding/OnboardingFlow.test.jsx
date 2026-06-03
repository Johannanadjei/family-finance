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
  createCentre: vi.fn().mockResolvedValue({ data: { id: 'c-new', cycle_anchor_type: 'calendar', cycle_anchor_day: null }, error: null }),
}));
vi.mock('../../services/categories.service', () => ({
  bulkAddCategories: vi.fn().mockResolvedValue({ error: null }),
}));
vi.mock('../../services/income.service', () => ({
  bulkAddIncomeSources: vi.fn().mockResolvedValue({ error: null }),
}));
vi.mock('../../services/cycles.service', () => ({
  createCycleByAnchor: vi.fn().mockResolvedValue({ data: { id: 'cyc-new' }, error: null }),
  getCyclesForCentre:  vi.fn().mockResolvedValue({ data: [], error: null }),
}));

import { createCentre }        from '../../services/centres.service';
import { createCycleByAnchor }  from '../../services/cycles.service';
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

describe('OnboardingFlow — first-cycle CYC02 closure', () => {
  it('creates the first cycle before bulk-inserting, stamped with its id', async () => {
    render(<OnboardingFlow onComplete={vi.fn()} />);
    walkToConfirm();
    await act(async () => { fireEvent.click(screen.getByText(/Create BOS Hub/)); });

    expect(createCentre).toHaveBeenCalledWith(expect.objectContaining({ cycle_anchor_type: 'calendar', cycle_anchor_day: null }));
    expect(createCycleByAnchor).toHaveBeenCalledWith('c-new', expect.objectContaining({ anchor_type: 'calendar' }));
    expect(bulkAddCategories).toHaveBeenCalledWith('c-new', expect.anything(), 'cyc-new');
    expect(bulkAddIncomeSources).toHaveBeenCalledWith('c-new', expect.anything(), 'cyc-new');
  });

  it('completes onboarding after all writes succeed', async () => {
    const onComplete = vi.fn();
    render(<OnboardingFlow onComplete={onComplete} />);
    walkToConfirm();
    await act(async () => { fireEvent.click(screen.getByText(/Create BOS Hub/)); });
    expect(onComplete).toHaveBeenCalled();
  });

  it('aborts before bulk insert when the first cycle cannot be created or resolved', async () => {
    createCycleByAnchor.mockResolvedValueOnce({ data: null, error: { code: 'CYC01', message: 'overlap' } });
    // getCyclesForCentre default mock returns [] → no active cycle resolvable → abort
    render(<OnboardingFlow onComplete={vi.fn()} />);
    walkToConfirm();
    await act(async () => { fireEvent.click(screen.getByText(/Create BOS Hub/)); });
    expect(bulkAddCategories).not.toHaveBeenCalled();
  });
});
