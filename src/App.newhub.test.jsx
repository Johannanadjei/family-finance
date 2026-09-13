/**
 * App.newhub.test.jsx
 *
 * The SECOND hub-creation door: App → DashboardShell → CreateHubSheet.
 *
 * App.test.jsx pins the same seam for the FIRST door (OnboardingFlow), but it lands
 * the three-gate startup on the onboarding branch and so never evaluates
 * DashboardShell. This file lands on the DASHBOARD branch and asserts the tier that
 * reaches the sheet. It lives apart from App.dashboard.test.jsx on purpose: that file
 * is a smoke test whose value is that every shell child is really evaluated, and
 * stubbing CreateHubSheet there would blind it.
 *
 * What it guards: CreateHubSheet used to hardcode plan="free" on its income step, on
 * the one path where the caller is ALWAYS Pro (free tier = one hub).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Read lazily inside the hook mock, never at factory time.
let subState = { tier: 'free', isLoading: false, error: null };

vi.mock('./lib/supabase', () => ({
  supabase: { auth: {}, from: () => ({}), rpc: () => ({}) },
}));

vi.mock('./hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'a@b.com' }, loading: false, signOut: vi.fn(), isRecovery: false }),
}));

vi.mock('./hooks/usePin', () => ({
  usePin: () => ({
    hasPinSetup: true, pinLoading: false, pinUnlocked: true,
    attempts: 0, lockedUntil: null,
    verifyPin: vi.fn(), setupPin: vi.fn(), removePin: vi.fn(),
  }),
}));

const CENTRE = { id: 'c1', name: 'Test Hub', currency: 'GHS', type: 'family', skin_id: null, surplus_target: 0, owner_id: 'u1' };

vi.mock('./hooks/useCentres', () => ({
  useCentres: () => ({
    centres: [CENTRE], archivedCentres: [], plan: 'free',
    loading: false, error: null, reload: vi.fn(),
  }),
}));

// Centre gate falls through to the dashboard: a centre exists, onboarding is done.
vi.mock('./hooks/useBudgetCentre', () => ({
  useBudgetCentre: () => ({
    centre: CENTRE, allCategories: [], reloadCategories: vi.fn(), members: [],
    currentMemberRole: 'owner', prevMonthCategories: [],
    loading: false, needsOnboarding: false, removedFromHub: false, error: null,
    addCategory: vi.fn(), updateCentre: vi.fn(), updateCentreSkin: vi.fn(),
    updateCategory: vi.fn(), deleteCategory: vi.fn(), loadPrevMonthCategories: vi.fn(),
    copyCategoriesToMonth: vi.fn(), archiveCentre: vi.fn(), permanentDeleteCentre: vi.fn(),
    restoreHub: vi.fn(), inviteMember: vi.fn(), removeMember: vi.fn(),
    updateMemberRole: vi.fn(), getInvites: vi.fn(), cancelInvite: vi.fn(),
    onOnboardingComplete: vi.fn(),
  }),
}));

vi.mock('./hooks/useFinance', () => ({
  useFinance: () => ({
    txs: [], incomes: [], allIncomes: [], categories: [], cycles: [], visibleCycles: [],
    cyclesLoading: true, loading: true, loaded: false, error: null,
    activeCycle: null, currentCycle: null, viewedCycle: null,
    activeCycleId: null, viewedCycleId: null, autoPeriod: null,
    dismissAutoPeriod: vi.fn(), ensurePeriodNow: vi.fn(), reload: vi.fn(),
    prefs: { themeSkin: 'family_warmth' },
  }),
}));

vi.mock('./hooks/useSubscription', () => ({
  useSubscription: () => ({
    subscription: null, isActive: false, isPro: subState.tier === 'pro',
    refresh: vi.fn(), ...subState,
  }),
}));

vi.mock('./hooks/useHubTier', () => ({
  useHubTier: () => ({ tier: 'free', isLoading: false }),
}));

// CreateHubSheet stub — renders the tier it was handed. The sheet is mounted closed
// in the shell, so the real component would render null and the prop would be
// unobservable; the stub makes the seam assertable without opening the sheet.
vi.mock('./features/hubs/CreateHubSheet', () => ({
  CreateHubSheet: ({ plan }) => <span data-testid="create-hub-plan">{String(plan)}</span>,
}));

import App from './App';

describe('App — create-hub tier seam', () => {
  beforeEach(() => { subState = { tier: 'free', isLoading: false, error: null }; });

  it('hands CreateHubSheet the pro tier (never a hardcoded free)', () => {
    subState = { tier: 'pro', isLoading: false, error: null };
    render(<App />);
    expect(screen.getByTestId('create-hub-plan').textContent).toBe('pro');
  });

  it('hands CreateHubSheet the free tier when that is the settled answer', () => {
    render(<App />);
    expect(screen.getByTestId('create-hub-plan').textContent).toBe('free');
  });

  it('passes null while the subscription is still loading', () => {
    subState = { tier: 'free', isLoading: true, error: null };
    render(<App />);
    expect(screen.getByTestId('create-hub-plan').textContent).toBe('null');
  });

  it('passes null when the subscription fetch failed (§12 — no cap off a failed read)', () => {
    subState = { tier: 'free', isLoading: false, error: 'network down' };
    render(<App />);
    expect(screen.getByTestId('create-hub-plan').textContent).toBe('null');
  });
});
