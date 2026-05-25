import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor }   from '@testing-library/react';
import { MembersSection }                       from './MembersSection';

const mockInviteMember  = vi.fn(async () => ({ data: { token: 'tok-abc' }, error: null }));
const mockRemoveMember  = vi.fn(async () => ({ error: null }));
const mockGetInvites    = vi.fn(async () => ({ data: [], error: null }));
const mockCancelInvite  = vi.fn(async () => ({ error: null }));

vi.mock('../../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({
    members:           [
      { id: 'mem-1', user_id: 'user-1', role: 'owner',    users: { name: 'Johannan', email: 'j@test.com' } },
      { id: 'mem-2', user_id: 'user-2', role: 'standard', users: { name: 'Bob',      email: 'b@test.com' } },
    ],
    currentMemberRole: 'owner',
    currentUserId:     'user-1',
    can:               () => true,
    inviteMember:      mockInviteMember,
    removeMember:      mockRemoveMember,
    getInvites:        mockGetInvites,
    cancelInvite:      mockCancelInvite,
    centre:            { id: 'c-1', name: 'Home' },
  }),
}));

vi.mock('../../context/FinanceContext', () => ({
  useFinanceContext: () => ({ userPlan: 'pro' }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetInvites.mockResolvedValue({ data: [], error: null });
});

describe('MembersSection', () => {
  it('renders member list', async () => {
    render(<MembersSection />);
    await waitFor(() => expect(screen.getByText('Johannan')).toBeTruthy());
    expect(screen.getByText('Bob')).toBeTruthy();
  });

  it('shows role labels', async () => {
    render(<MembersSection />);
    await waitFor(() => expect(screen.getByText('Owner')).toBeTruthy());
    expect(screen.getByText('Standard')).toBeTruthy();
  });

  it('shows Remove button for non-owner members', async () => {
    render(<MembersSection />);
    await waitFor(() => expect(screen.getByTestId('remove-member-mem-2')).toBeTruthy());
  });

  it('does not show Remove button for owner', async () => {
    render(<MembersSection />);
    await waitFor(() => expect(screen.queryByTestId('remove-member-mem-1')).toBeNull());
  });

  it('calls removeMember when Remove clicked', async () => {
    render(<MembersSection />);
    await waitFor(() => screen.getByTestId('remove-member-mem-2'));
    fireEvent.click(screen.getByTestId('remove-member-mem-2'));
    await waitFor(() => expect(mockRemoveMember).toHaveBeenCalledWith('mem-2', 'standard'));
  });

  it('shows invite form when + Invite Member clicked', async () => {
    render(<MembersSection />);
    await waitFor(() => screen.getByTestId('invite-member-btn'));
    fireEvent.click(screen.getByTestId('invite-member-btn'));
    expect(screen.getByTestId('invite-email-input')).toBeTruthy();
    expect(screen.getByTestId('invite-role-select')).toBeTruthy();
  });

  it('shows error when sending invite with empty email', async () => {
    render(<MembersSection />);
    await waitFor(() => screen.getByTestId('invite-member-btn'));
    fireEvent.click(screen.getByTestId('invite-member-btn'));
    fireEvent.click(screen.getByTestId('send-invite-btn'));
    await waitFor(() => expect(screen.getByText(/valid email/i)).toBeTruthy());
  });

  it('calls inviteMember and shows link on success', async () => {
    render(<MembersSection />);
    await waitFor(() => screen.getByTestId('invite-member-btn'));
    fireEvent.click(screen.getByTestId('invite-member-btn'));
    fireEvent.change(screen.getByTestId('invite-email-input'), { target: { value: 'new@test.com' } });
    fireEvent.click(screen.getByTestId('send-invite-btn'));
    await waitFor(() => expect(mockInviteMember).toHaveBeenCalledWith({ email: 'new@test.com', role: 'standard' }));
    await waitFor(() => expect(screen.getByText(/invite link ready/i)).toBeTruthy());
    expect(screen.getByText(/no email is sent automatically/i)).toBeTruthy();
    expect(screen.getByText('new@test.com')).toBeTruthy();
  });

  it('shows pending invites', async () => {
    mockGetInvites.mockResolvedValue({
      data: [{ id: 'inv-1', invited_email: 'alice@test.com', role: 'standard', status: 'pending', expires_at: new Date(Date.now() + 86400000).toISOString() }],
      error: null,
    });
    render(<MembersSection />);
    await waitFor(() => expect(screen.getByText('alice@test.com')).toBeTruthy());
    expect(screen.getByTestId('cancel-invite-inv-1')).toBeTruthy();
  });

  it('calls cancelInvite when Cancel clicked', async () => {
    mockGetInvites.mockResolvedValue({
      data: [{ id: 'inv-1', invited_email: 'alice@test.com', role: 'standard', status: 'pending', expires_at: new Date(Date.now() + 86400000).toISOString() }],
      error: null,
    });
    render(<MembersSection />);
    await waitFor(() => screen.getByTestId('cancel-invite-inv-1'));
    fireEvent.click(screen.getByTestId('cancel-invite-inv-1'));
    await waitFor(() => expect(mockCancelInvite).toHaveBeenCalledWith('inv-1'));
  });
});
