/**
 * App.dashboard.test.jsx — the DASHBOARD-branch smoke test.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * On 2026-09-05 `<PeriodSetupPrompt />` shipped to the dev preview mounted in
 * DashboardShell with no import. It white-screened the app for every user, and the
 * whole pipeline was green:
 *
 *   • 1846 unit tests passed. Component tests import their component directly, so a
 *     missing import in the file that MOUNTS it is invisible to them.
 *   • App.test.jsx renders <App/> — but lands the three-gate startup on the ONBOARDING
 *     branch, which returns <OnboardingFlow/> and never evaluates DashboardShell.
 *   • The e2e smoke test signs in as a fixture owning 0 hubs, so it lands on onboarding
 *     too. Same branch, same blind spot.
 *   • `vite build` succeeded. A bare undefined identifier is valid JavaScript; it
 *     throws when the expression is EVALUATED, not when the module is bundled.
 *
 * Nothing in CI rendered the dashboard — the screen every real user actually sees.
 * This file does, so a ReferenceError in the shell fails the suite.
 *
 * ── WHY IT ASSERTS SO LITTLE ─────────────────────────────────────────────────
 * The point is EVALUATION, not output. `<X />` compiles to `jsx(X, …)`, which throws
 * on an undefined X whatever the component would have returned. So the views are held
 * at their loading gates (cyclesLoading: true) — this stays a smoke test of the shell
 * rather than a second, brittle copy of every view's test. Deep behaviour belongs in
 * the view suites; what belongs HERE is "the dashboard mounts at all".
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

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

const CENTRE = { id: 'c1', name: 'Test Hub', currency: 'GHS', type: 'family', skin_id: null, surplus_target: 0 };

vi.mock('./hooks/useCentres', () => ({
  useCentres: () => ({
    centres: [CENTRE], archivedCentres: [], plan: 'free',
    loading: false, error: null, reload: vi.fn(),
  }),
}));

// The centre gate falls through to the dashboard: a centre exists and onboarding is done.
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

// cyclesLoading holds the routed views at their first-paint gate, so this stays a
// smoke test of the SHELL. The shell and everything it mounts still evaluate.
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
    subscription: null, tier: 'free', isActive: false, isPro: false,
    isLoading: false, error: null, refresh: vi.fn(),
  }),
}));

vi.mock('./hooks/useHubTier', () => ({
  useHubTier: () => ({ tier: 'free', isLoading: false }),
}));

import App from './App';

describe('App — dashboard smoke', () => {
  it('mounts the dashboard shell without throwing', () => {
    // A missing import in DashboardShell throws a ReferenceError here, before any
    // assertion runs — which is the entire point of the test.
    expect(() => render(<App />)).not.toThrow();
  });

  it('renders the shell chrome, so every component it mounts was evaluated', () => {
    render(<App />);
    expect(document.getElementById('app-shell')).toBeTruthy();
    expect(screen.getByTestId('nav-tab-home')).toBeTruthy();
  });
});
