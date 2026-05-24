/**
 * views/GuestPortal.test.jsx
 * Written before GuestPortal.jsx — TDD.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen }                        from '@testing-library/react';
import { GuestPortal }                           from './GuestPortal';

// Mock useGuestAuth so we control the session / guest state
const mockLoadGuests  = vi.fn();
const mockAuthenticate = vi.fn();
const mockSignOut     = vi.fn();
let mockHookReturn;

vi.mock('../hooks/useGuestAuth', () => ({
  useGuestAuth: () => mockHookReturn,
}));

// Stub applyTheme so no DOM errors
vi.mock('../lib/themes', () => ({ applyTheme: vi.fn() }));

const noSession = {
  session:      null,
  guests:       [{ id: 'guest-1', name: 'Sarah' }],
  loading:      false,
  error:        null,
  loadGuests:   mockLoadGuests,
  authenticate: mockAuthenticate,
  signOut:      mockSignOut,
};

const withSession = {
  ...noSession,
  session: { guestId: 'guest-1', guestName: 'Sarah', allowedCategories: ['Groceries'], centreId: 'c1' },
};

describe('GuestPortal', () => {
  beforeEach(() => {
    mockHookReturn = noSession;
    mockLoadGuests.mockClear();
    vi.mock('../../services/guests.service', () => ({
      submitGuestTransaction: vi.fn().mockResolvedValue({ data: 'id', error: null }),
    }));
  });

  it('shows invalid link message when centreId is null', () => {
    render(<GuestPortal centreId={null} />);
    expect(screen.getByText(/Invalid guest link/)).toBeTruthy();
  });

  it('shows GuestPinScreen when there is no session', () => {
    render(<GuestPortal centreId="c1" />);
    // GuestPinScreen renders guest name buttons
    expect(screen.getByTestId('guest-btn-guest-1')).toBeTruthy();
  });

  it('shows GuestTransactionForm when session exists', () => {
    mockHookReturn = withSession;
    // GuestTransactionForm needs submitGuestTransaction mock
    vi.mock('../services/guests.service', () => ({
      submitGuestTransaction: vi.fn().mockResolvedValue({ data: 'id', error: null }),
    }));
    render(<GuestPortal centreId="c1" />);
    expect(screen.getByTestId('guest-amount-input')).toBeTruthy();
  });

  it('calls loadGuests on mount when no session', () => {
    render(<GuestPortal centreId="c1" />);
    expect(mockLoadGuests).toHaveBeenCalled();
  });

  it('does not call loadGuests when session already exists', () => {
    mockHookReturn = withSession;
    vi.mock('../services/guests.service', () => ({
      submitGuestTransaction: vi.fn().mockResolvedValue({ data: 'id', error: null }),
    }));
    render(<GuestPortal centreId="c1" />);
    expect(mockLoadGuests).not.toHaveBeenCalled();
  });

  it('shows loading state', () => {
    mockHookReturn = { ...noSession, loading: true, guests: [] };
    render(<GuestPortal centreId="c1" />);
    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  it('passes loadGuests as onRetry to GuestPinScreen', () => {
    mockHookReturn = { ...noSession, guests: [], error: 'Could not load guests. Please try again.' };
    render(<GuestPortal centreId="c1" />);
    const retryBtn = screen.getByText('Try again');
    retryBtn.click();
    expect(mockLoadGuests).toHaveBeenCalled();
  });
});
