import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor }               from '@testing-library/react';
import { JoinView }                                         from './JoinView';

const mockGetInviteByToken = vi.fn();
const mockAcceptInvite     = vi.fn();
const mockGetUserSession   = vi.fn();
const mockWaitForSession   = vi.fn();
const mockSignUpUser       = vi.fn();
const mockSignInUser       = vi.fn();
const mockSignOutUser      = vi.fn();
const mockSaveActiveCentreId = vi.fn();
const mockUpdateUserName   = vi.fn();

vi.mock('../services/invites.service', () => ({
  getInviteByToken: (...args) => mockGetInviteByToken(...args),
  acceptInvite:     (...args) => mockAcceptInvite(...args),
}));

vi.mock('../services/auth.service', () => ({
  getUserSession:   (...args) => mockGetUserSession(...args),
  waitForSession:   (...args) => mockWaitForSession(...args),
  signUpUser:       (...args) => mockSignUpUser(...args),
  signInUser:       (...args) => mockSignInUser(...args),
  signOutUser:      (...args) => mockSignOutUser(...args),
  updateUserName:   (...args) => mockUpdateUserName(...args),
}));

vi.mock('../lib/storage', () => ({
  saveActiveCentreId: (...args) => mockSaveActiveCentreId(...args),
}));

const futureDate = new Date(Date.now() + 86400000).toISOString();
const pastDate   = new Date(Date.now() - 86400000).toISOString();

const mockInvite = {
  id:             'inv-1',
  token:          'tok-abc',
  invited_email:  'alice@test.com',
  role:           'standard',
  status:         'pending',
  expires_at:     futureDate,
  budget_centres: { id: 'c-1', name: 'Home Hub', icon: '🏠', currency: 'GHS' },
};

const mockUser = { id: 'u-1', email: 'alice@test.com' };

beforeEach(() => {
  vi.stubGlobal('location', { search: '?token=tok-abc', href: '', pathname: '/join' });
  vi.clearAllMocks();
  mockGetUserSession.mockResolvedValue({ data: null, error: null });
  mockWaitForSession.mockResolvedValue({ data: { access_token: 'tok' }, error: null });
  mockAcceptInvite.mockResolvedValue({ data: { centreId: 'c-1' }, error: null });
});

afterEach(() => { vi.unstubAllGlobals(); });

// ── Bug 1 cases ───────────────────────────────────────────────────────────────

describe('JoinView — invalid invite states', () => {
  it('renders invalid when no token in URL', async () => {
    vi.stubGlobal('location', { search: '', href: '', pathname: '/join' });
    render(<JoinView />);
    await waitFor(() => expect(screen.getByText(/invalid or expired invite/i)).toBeTruthy());
    // Brand lockup is rendered by JoinCard on every phase, including invalid
    expect(screen.getByText('Money B.O.S')).toBeTruthy();
  });

  it('renders invalid when getInviteByToken returns null (RLS-blocked or not found)', async () => {
    mockGetInviteByToken.mockResolvedValue({ data: null, error: null });
    render(<JoinView />);
    await waitFor(() => expect(screen.getByText(/invalid or expired invite/i)).toBeTruthy());
  });

  it('renders invalid when getInviteByToken returns null (already accepted — filtered by status)', async () => {
    mockGetInviteByToken.mockResolvedValue({ data: null, error: null });
    render(<JoinView />);
    await waitFor(() => expect(screen.getByText(/invalid or expired invite/i)).toBeTruthy());
  });

  it('renders invalid when expires_at is null — does not treat as expired', async () => {
    mockGetInviteByToken.mockResolvedValue({ data: { ...mockInvite, expires_at: null }, error: null });
    render(<JoinView />);
    await waitFor(() => expect(screen.getByText(/invalid or expired invite/i)).toBeTruthy());
  });

  it('renders invalid when invite is genuinely expired', async () => {
    mockGetInviteByToken.mockResolvedValue({ data: { ...mockInvite, expires_at: pastDate }, error: null });
    render(<JoinView />);
    await waitFor(() => expect(screen.getByText(/invalid or expired invite/i)).toBeTruthy());
  });
});

describe('JoinView — valid invite, user signed in', () => {
  it('renders confirm phase for valid invite when user email matches', async () => {
    mockGetInviteByToken.mockResolvedValue({ data: mockInvite, error: null });
    mockGetUserSession.mockResolvedValue({ data: { user: mockUser }, error: null });
    render(<JoinView />);
    await waitFor(() => expect(screen.getByTestId('confirm-join-btn')).toBeTruthy());
    expect(screen.getByText(/Home Hub/)).toBeTruthy();
  });
});

// ── Bug 2 cases ───────────────────────────────────────────────────────────────

describe('JoinView — name propagation to acceptInvite', () => {
  it('sign-up path — acceptInvite called with name from input', async () => {
    mockGetInviteByToken.mockResolvedValue({ data: mockInvite, error: null });
    // No current user → auth phase
    mockGetUserSession.mockResolvedValue({ data: null, error: null });
    mockSignUpUser.mockResolvedValue({ data: { user: mockUser }, error: null });

    render(<JoinView />);
    // Switch to signup mode and fill form
    await waitFor(() => screen.getByText('Create account'));
    fireEvent.click(screen.getByText('Create account'));
    fireEvent.change(screen.getByPlaceholderText('Your full name'), { target: { value: 'Alice Mensah' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'pass123' } });
    fireEvent.click(screen.getByText('Create account & join'));

    // Moves to confirm phase after signup
    await waitFor(() => screen.getByTestId('confirm-join-btn'));
    fireEvent.click(screen.getByTestId('confirm-join-btn'));

    await waitFor(() => expect(mockAcceptInvite).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'tok-abc', name: 'Alice Mensah' })
    ));
  });

  it('sign-in path — acceptInvite called with empty name (no name input shown)', async () => {
    mockGetInviteByToken.mockResolvedValue({ data: mockInvite, error: null });
    mockGetUserSession.mockResolvedValue({ data: { user: mockUser }, error: null });

    render(<JoinView />);
    await waitFor(() => screen.getByTestId('confirm-join-btn'));
    fireEvent.click(screen.getByTestId('confirm-join-btn'));

    await waitFor(() => expect(mockAcceptInvite).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'tok-abc', name: '' })
    ));
  });

  it('does not call updateUserName after successful join', async () => {
    mockGetInviteByToken.mockResolvedValue({ data: mockInvite, error: null });
    mockGetUserSession.mockResolvedValue({ data: { user: mockUser }, error: null });

    render(<JoinView />);
    await waitFor(() => screen.getByTestId('confirm-join-btn'));
    fireEvent.click(screen.getByTestId('confirm-join-btn'));

    await waitFor(() => expect(mockAcceptInvite).toHaveBeenCalled());
    expect(mockUpdateUserName).not.toHaveBeenCalled();
  });
});
