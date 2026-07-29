/**
 * App.recovery.test.jsx
 *
 * Regression: the password-recovery screen must render BEFORE the auth and PIN gates.
 *
 * A Supabase recovery link establishes a real session, so `user` is non-null by the time
 * App renders. If the reset screen sat inside DashboardShell's <Routes> (or anywhere after
 * the gates), a user with a PIN would be shown the PIN screen — asked for a second secret
 * at the exact moment they have proven they cannot get in. These tests pin the ordering by
 * mocking a PIN-locked session and asserting the reset screen wins.
 *
 * Both triggers are covered: the /reset-password path (primary — survives a page reload,
 * which the PASSWORD_RECOVERY event does not) and the isRecovery flag (backstop).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

let mockIsRecovery = false;

vi.mock('./lib/supabase', () => ({
  supabase: { auth: {}, from: () => ({}), rpc: () => ({}) },
}));

vi.mock('./hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'a@b.com' },
    loading: false,
    signOut: vi.fn(),
    isRecovery: mockIsRecovery,
  }),
}));

// PIN set and NOT unlocked — the gate that would otherwise swallow the recovery flow.
vi.mock('./hooks/usePin', () => ({
  usePin: () => ({
    hasPinSetup: true, pinLoading: false, pinUnlocked: false,
    attempts: 0, lockedUntil: null,
    verifyPin: vi.fn(), setupPin: vi.fn(), removePin: vi.fn(),
  }),
}));

vi.mock('./hooks/useCentres', () => ({
  useCentres: () => ({
    centres: [], archivedCentres: [], plan: 'free',
    loading: false, error: null, reload: vi.fn(),
  }),
}));

vi.mock('./hooks/useBudgetCentre', () => ({
  useBudgetCentre: () => ({
    centre: null, categories: [], members: [], currentMemberRole: 'owner',
    loading: false, needsOnboarding: false, error: null, removedFromHub: false,
    onOnboardingComplete: vi.fn(),
  }),
}));

vi.mock('./hooks/useFinance', () => ({ useFinance: () => ({}) }));

vi.mock('./hooks/useSubscription', () => ({
  useSubscription: () => ({
    subscription: null, tier: 'free', isActive: false, isPro: false,
    isLoading: false, error: null, refresh: vi.fn(),
  }),
}));

// Stub the screen itself — these tests assert ROUTING, not the reset form
// (that is covered in views/ResetPasswordScreen.test.jsx).
vi.mock('./views/ResetPasswordScreen', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ResetPasswordScreen: ({ onComplete }) => (
      <button data-testid="reset-password-screen" onClick={onComplete}>reset</button>
    ),
  };
});

import App from './App';

const setPath = (path) => window.history.replaceState({}, '', path);

describe('App — password recovery routing', () => {
  beforeEach(() => {
    mockIsRecovery = false;
    setPath('/');
  });

  afterEach(() => setPath('/'));

  it('renders the reset screen on /reset-password, ahead of the PIN gate', () => {
    setPath('/reset-password');
    render(<App />);
    expect(screen.getByTestId('reset-password-screen')).toBeTruthy();
    expect(screen.queryByTestId('pin-screen')).toBeNull();
  });

  it('renders the reset screen on /reset-password with a trailing slash', () => {
    setPath('/reset-password/');
    render(<App />);
    expect(screen.getByTestId('reset-password-screen')).toBeTruthy();
  });

  // The link arrives as /reset-password#access_token=…&type=recovery — the hash must
  // not defeat the path match (pathname excludes the fragment).
  it('renders the reset screen when the recovery hash is still on the URL', () => {
    setPath('/reset-password#access_token=abc&type=recovery');
    render(<App />);
    expect(screen.getByTestId('reset-password-screen')).toBeTruthy();
  });

  it('renders the reset screen when PASSWORD_RECOVERY fired on another path', () => {
    mockIsRecovery = true;
    setPath('/');
    render(<App />);
    expect(screen.getByTestId('reset-password-screen')).toBeTruthy();
    expect(screen.queryByTestId('pin-screen')).toBeNull();
  });

  // No regression to the normal startup path: an ordinary session still hits the PIN gate.
  it('falls through to the PIN gate for a normal session', () => {
    render(<App />);
    expect(screen.queryByTestId('reset-password-screen')).toBeNull();
    expect(screen.getByTestId('pin-screen')).toBeTruthy();
  });
});
