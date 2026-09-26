/**
 * App.pricing.test.jsx — the signed-out half of the /pricing gate.
 *
 * /pricing is owner-only (decision (a), 2026-09-26 — go-live runbook §1). The owner-vs-
 * member split lives where the route is mounted and is tested there
 * (DashboardShell.test.jsx). What belongs HERE is the third case: a signed-out visitor
 * who types /pricing never reaches the dashboard at all — the auth gate in App.jsx
 * answers first, so there is no checkout to land on.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('./lib/supabase', () => ({
  supabase: { auth: {}, from: () => ({}), rpc: () => ({}) },
}));

vi.mock('./hooks/useAuth', () => ({
  useAuth: () => ({ user: null, loading: false, signOut: vi.fn(), isRecovery: false }),
}));

vi.mock('./hooks/usePin', () => ({
  usePin: () => ({
    hasPinSetup: false, pinLoading: false, pinUnlocked: false,
    attempts: 0, lockedUntil: null,
    verifyPin: vi.fn(), setupPin: vi.fn(), removePin: vi.fn(),
  }),
}));

vi.mock('./hooks/useCentres', () => ({
  useCentres: () => ({ centres: [], archivedCentres: [], plan: 'free', loading: false, error: null, reload: vi.fn() }),
}));

vi.mock('./hooks/useBudgetCentre', () => ({
  useBudgetCentre: () => ({
    centre: null, allCategories: [], members: [], currentMemberRole: 'standard',
    loading: false, needsOnboarding: false, removedFromHub: false, error: null,
  }),
}));

vi.mock('./hooks/useFinance', () => ({
  useFinance: () => ({ prefs: { themeSkin: 'family_warmth' } }),
}));

vi.mock('./hooks/useSubscription', () => ({
  useSubscription: () => ({
    subscription: null, tier: 'free', isActive: false, isPro: false,
    isLoading: false, error: null, refresh: vi.fn(),
  }),
}));

vi.mock('./hooks/useHubTier', () => ({
  useHubTier: () => ({ tier: null, isLoading: false }),
}));

vi.mock('./views/AuthScreen', () => ({ AuthScreen: () => <div>auth screen</div> }));
vi.mock('./views/PricingView', () => ({ PricingView: () => <div>pricing view</div> }));

import App from './App';

describe('App — /pricing while signed out', () => {
  beforeEach(() => { window.history.pushState({}, '', '/pricing'); });
  afterEach(() => { window.history.pushState({}, '', '/'); });

  it('renders the auth screen, never the pricing page', () => {
    render(<App />);
    expect(screen.getByText('auth screen')).toBeTruthy();
    expect(screen.queryByText('pricing view')).toBeNull();
    expect(screen.queryByTestId('access-blocked')).toBeNull();
  });
});
