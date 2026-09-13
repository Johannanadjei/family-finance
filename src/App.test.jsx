/**
 * App.test.jsx
 *
 * Regression: the onboarding → dashboard handoff must refresh the hub LIST
 * (useCentres), not just the active centre (useBudgetCentre). Before the fix,
 * a freshly-created first hub was absent from the SidePanel until app reopen
 * because onboarding completion only reloaded useBudgetCentre.
 *
 * This test drives the onboarding gate (needsOnboarding === true), fires the
 * OnboardingFlow's onComplete, and asserts reloadCentres() is both CALLED and
 * AWAITED before onOnboardingComplete fires.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent }        from '@testing-library/react';

// ── Shared spies + call-order log (proves ordering, not just invocation) ──────
const callOrder = [];
let resolveReload;
const reloadCentresSpy = vi.fn(() => {
  callOrder.push('reload');
  return new Promise((res) => { resolveReload = res; });
});
const onOnboardingCompleteSpy = vi.fn(() => { callOrder.push('complete'); });

// Stub the Supabase client so importing App doesn't construct a real client
// (App's import graph reaches lib/supabase, which needs env vars). All data
// access is mocked at the hook layer below, so this is never actually called.
vi.mock('./lib/supabase', () => ({
  supabase: { auth: {}, from: () => ({}), rpc: () => ({}) },
}));

// ── Hook mocks — land the three startup gates on the onboarding branch ────────
vi.mock('./hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'a@b.com' }, loading: false, signOut: vi.fn() }),
}));

vi.mock('./hooks/usePin', () => ({
  usePin: () => ({
    hasPinSetup: true, pinLoading: false, pinUnlocked: true,
    attempts: 0, lockedUntil: null,
    verifyPin: vi.fn(), setupPin: vi.fn(), removePin: vi.fn(),
  }),
}));

vi.mock('./hooks/useCentres', () => ({
  useCentres: () => ({
    centres: [], archivedCentres: [], plan: 'free',
    loading: false, error: null, reload: reloadCentresSpy,
  }),
}));

vi.mock('./hooks/useBudgetCentre', () => ({
  useBudgetCentre: () => ({
    centre: null, categories: [], members: [], currentMemberRole: 'owner',
    loading: false, needsOnboarding: true, error: null, removedFromHub: false,
    onOnboardingComplete: onOnboardingCompleteSpy,
  }),
}));

vi.mock('./hooks/useFinance', () => ({
  useFinance: () => ({}),
}));

// Mutable so each test can land the subscription hook on a different tier/state.
// Read lazily (inside the returned function), never at factory time.
let subState = { tier: 'free', isLoading: false, error: null };
vi.mock('./hooks/useSubscription', () => ({
  useSubscription: () => ({
    subscription: null, isActive: false, isPro: subState.tier === 'pro',
    refresh: vi.fn(), ...subState,
  }),
}));

// OnboardingFlow stub — exposes the onComplete handoff as a clickable button and
// renders the `plan` it was handed, so the App → onboarding tier seam is assertable.
vi.mock('./features/onboarding/OnboardingFlow', () => ({
  OnboardingFlow: ({ onComplete, plan }) => (
    <>
      <span data-testid="onboarding-plan">{String(plan)}</span>
      <button data-testid="finish-onboarding" onClick={onComplete}>finish</button>
    </>
  ),
}));

import App from './App';

describe('App — onboarding handoff', () => {
  beforeEach(() => {
    callOrder.length = 0;
    resolveReload = undefined;
    subState = { tier: 'free', isLoading: false, error: null };
    reloadCentresSpy.mockClear();
    onOnboardingCompleteSpy.mockClear();
  });

  it('awaits reloadCentres before completing onboarding so the new hub appears in the SidePanel', async () => {
    render(<App />);

    // Fire the onboarding → dashboard handoff.
    await act(async () => {
      fireEvent.click(screen.getByTestId('finish-onboarding'));
    });

    // The hub list refetch must have started…
    expect(reloadCentresSpy).toHaveBeenCalledTimes(1);
    // …and onOnboardingComplete must NOT fire until that refetch resolves
    // (proves the await actually awaits, not just that both were called).
    expect(onOnboardingCompleteSpy).not.toHaveBeenCalled();

    // Resolve the in-flight list fetch.
    await act(async () => { resolveReload(); });

    expect(onOnboardingCompleteSpy).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['reload', 'complete']);
  });

  // ── Tier seam ─────────────────────────────────────────────────────────────
  // OnboardingFlow used to resolve its own tier off users.plan — the column the
  // subscriptions table replaced — so a Pro user was onboarded under free caps.
  // The tier now comes from the same useSubscription read the dashboard uses.
  // It is the VIEWER's tier, not a hub tier: the hub does not exist yet, and
  // create_hub/create_category gate on the caller (see useHubTier's "NOT for the
  // hub cap" note). Unresolved stays null — every step gate is `plan === 'free' && …`,
  // so null renders no cap; 'free' would render a false one on a paid account.
  it('passes the subscription tier into onboarding (pro)', async () => {
    subState = { tier: 'pro', isLoading: false, error: null };
    await act(async () => { render(<App />); });
    expect(screen.getByTestId('onboarding-plan').textContent).toBe('pro');
  });

  it('passes the subscription tier into onboarding (free)', async () => {
    await act(async () => { render(<App />); });
    expect(screen.getByTestId('onboarding-plan').textContent).toBe('free');
  });

  it('passes null while the subscription is still loading', async () => {
    subState = { tier: 'free', isLoading: true, error: null };
    await act(async () => { render(<App />); });
    expect(screen.getByTestId('onboarding-plan').textContent).toBe('null');
  });

  it('passes null when the subscription fetch failed (§12 — no cap off a failed read)', async () => {
    subState = { tier: 'free', isLoading: false, error: 'network down' };
    await act(async () => { render(<App />); });
    expect(screen.getByTestId('onboarding-plan').textContent).toBe('null');
  });
});
