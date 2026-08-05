import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MembersSection }                       from './MembersSection';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));

const mockInviteMember  = vi.fn(async () => ({ data: { token: 'tok-abc' }, error: null }));
const mockRemoveMember  = vi.fn(async () => ({ error: null }));
const mockGetInvites    = vi.fn(async () => ({ data: [], error: null }));
const mockCancelInvite  = vi.fn(async () => ({ error: null }));

const defaultMembers = [
  { id: 'mem-1', user_id: 'user-1', role: 'owner',    joined_at: '2026-01-01T00:00:00Z', users: { name: 'Johannan', email: 'j@test.com' } },
  { id: 'mem-2', user_id: 'user-2', role: 'standard', joined_at: '2026-02-01T00:00:00Z', users: { name: 'Bob',      email: 'b@test.com' } },
];
let mockMembersList = defaultMembers;
let mockHubPlan    = 'pro';
let mockIsOwner    = true;

vi.mock('../../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({
    members:           mockMembersList,
    currentMemberRole: 'owner',
    currentUserId:     'user-1',
    can:               () => true,
    isOwner:           mockIsOwner,
    inviteMember:      mockInviteMember,
    removeMember:      mockRemoveMember,
    getInvites:        mockGetInvites,
    cancelInvite:      mockCancelInvite,
    centre:            { id: 'c-1', name: 'Home' },
  }),
}));

vi.mock('../../context/FinanceContext', () => ({
  useFinanceContext: () => ({ hubPlan: mockHubPlan }),
}));

const futureISO = () => new Date(Date.now() + 86400000).toISOString();
const pastISO   = () => new Date(Date.now() - 86400000).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  mockMembersList = defaultMembers;
  mockHubPlan    = 'pro';
  mockIsOwner    = true;
  mockGetInvites.mockResolvedValue({ data: [], error: null });
});

describe('MembersSection', () => {
  it('renders member list', async () => {
    render(<MembersSection />);
    await waitFor(() => expect(screen.getByText('Johannan')).toBeTruthy());
    expect(screen.getByText('Bob')).toBeTruthy();
  });

  it('shows member count over the tier cap (pro: 2 of 15)', async () => {
    render(<MembersSection />);
    await waitFor(() => expect(screen.getByTestId('member-count').textContent).toBe('2 of 15'));
  });

  it('shows member count at the free cap (2 of 2), excluding pending invites', async () => {
    mockHubPlan    = 'free';
    mockMembersList = [defaultMembers[0]];   // owner only → 1 active member
    mockGetInvites.mockResolvedValue({
      data: [{ id: 'inv-1', invited_email: 'alice@test.com', role: 'standard', status: 'pending', expires_at: futureISO() }],
      error: null,
    });
    render(<MembersSection />);
    // Count reflects active members only (1), not the pending invite, over the free cap (2).
    await waitFor(() => expect(screen.getByTestId('member-count').textContent).toBe('1 of 2'));
  });

  it('orders members owner first, then by joined_at ascending', async () => {
    mockMembersList = [
      { id: 'mem-2', user_id: 'user-2', role: 'standard', joined_at: '2026-03-01T00:00:00Z', users: { name: 'Bob',      email: 'b@test.com' } },
      { id: 'mem-3', user_id: 'user-3', role: 'standard', joined_at: '2026-02-01T00:00:00Z', users: { name: 'Carol',    email: 'c@test.com' } },
      { id: 'mem-1', user_id: 'user-1', role: 'owner',    joined_at: '2026-04-01T00:00:00Z', users: { name: 'Johannan', email: 'j@test.com' } },
    ];
    render(<MembersSection />);
    await waitFor(() => screen.getByText('Johannan'));
    const names = screen.getAllByText(/^(Johannan|Carol|Bob)$/).map(n => n.textContent);
    expect(names).toEqual(['Johannan', 'Carol', 'Bob']);
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

  it('shows confirmation prompt when Remove clicked', async () => {
    render(<MembersSection />);
    await waitFor(() => screen.getByTestId('remove-member-mem-2'));
    fireEvent.click(screen.getByTestId('remove-member-mem-2'));
    expect(screen.getByText(/Remove Bob\?/)).toBeTruthy();
    expect(screen.getByTestId('confirm-remove-member-mem-2')).toBeTruthy();
    expect(screen.getByTestId('cancel-remove-member-mem-2')).toBeTruthy();
  });

  it('does not call removeMember after first click (waits for confirm)', async () => {
    render(<MembersSection />);
    await waitFor(() => screen.getByTestId('remove-member-mem-2'));
    fireEvent.click(screen.getByTestId('remove-member-mem-2'));
    expect(mockRemoveMember).not.toHaveBeenCalled();
  });

  it('calls removeMember when Yes confirmed', async () => {
    render(<MembersSection />);
    await waitFor(() => screen.getByTestId('remove-member-mem-2'));
    fireEvent.click(screen.getByTestId('remove-member-mem-2'));
    fireEvent.click(screen.getByTestId('confirm-remove-member-mem-2'));
    await waitFor(() => expect(mockRemoveMember).toHaveBeenCalledWith('mem-2', 'standard'));
  });

  it('hides confirmation and does not call removeMember when No clicked', async () => {
    render(<MembersSection />);
    await waitFor(() => screen.getByTestId('remove-member-mem-2'));
    fireEvent.click(screen.getByTestId('remove-member-mem-2'));
    fireEvent.click(screen.getByTestId('cancel-remove-member-mem-2'));
    expect(mockRemoveMember).not.toHaveBeenCalled();
    expect(screen.queryByText(/Remove Bob\?/)).toBeNull();
    expect(screen.getByTestId('remove-member-mem-2')).toBeTruthy();
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

  it('removes invite immediately (optimistic) when Cancel clicked', async () => {
    mockGetInvites.mockResolvedValue({
      data: [{ id: 'inv-1', invited_email: 'alice@test.com', role: 'standard', status: 'pending', expires_at: new Date(Date.now() + 86400000).toISOString() }],
      error: null,
    });
    render(<MembersSection />);
    await waitFor(() => screen.getByTestId('cancel-invite-inv-1'));
    fireEvent.click(screen.getByTestId('cancel-invite-inv-1'));
    await waitFor(() => expect(screen.queryByTestId('cancel-invite-inv-1')).toBeNull());
  });

  it('shows error and reloads if cancel fails', async () => {
    mockGetInvites.mockResolvedValue({
      data: [{ id: 'inv-1', invited_email: 'alice@test.com', role: 'standard', status: 'pending', expires_at: new Date(Date.now() + 86400000).toISOString() }],
      error: null,
    });
    mockCancelInvite.mockResolvedValue({ error: { message: 'Network error' } });
    render(<MembersSection />);
    await waitFor(() => screen.getByTestId('cancel-invite-inv-1'));
    fireEvent.click(screen.getByTestId('cancel-invite-inv-1'));
    await waitFor(() => expect(screen.getByText('Network error')).toBeTruthy());
  });

  // ── plan cap gate ──────────────────────────────────────────────────────────

  it('shows Upgrade to Pro button at the free member cap (2), hiding the invite button', async () => {
    mockHubPlan = 'free';   // 2 default members → at the free cap of 2
    render(<MembersSection />);
    await waitFor(() => expect(screen.getByTestId('upgrade-members-btn')).toBeTruthy());
    expect(screen.queryByTestId('invite-member-btn')).toBeNull();
  });

  it('opens the member-cap UpgradeModal with up-to-15 copy when Upgrade clicked', async () => {
    mockHubPlan = 'free';
    render(<MembersSection />);
    await waitFor(() => screen.getByTestId('upgrade-members-btn'));
    fireEvent.click(screen.getByTestId('upgrade-members-btn'));
    await waitFor(() => expect(screen.getByText(/member limit/i)).toBeTruthy());
    expect(screen.getByText(/up to 15 members/i)).toBeTruthy();
  });

  it('member-cap modal CTA routes to /pricing', async () => {
    mockHubPlan = 'free';
    render(<MembersSection />);
    await waitFor(() => screen.getByTestId('upgrade-members-btn'));
    fireEvent.click(screen.getByTestId('upgrade-members-btn'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByText('Upgrade to Pro'));   // modal CTA, not the trigger
    expect(mockNavigate).toHaveBeenCalledWith('/pricing');
  });

  // manageMembers is owner-only today, so isOwner is currently implied by canManage —
  // this pins the billing gate independently, so it cannot start selling to a
  // co-owner if the role map ever lets full_access invite.
  it('non-owner at the member cap: no pay CTA, ask-owner instead', async () => {
    mockHubPlan = 'free';
    mockIsOwner = false;
    render(<MembersSection />);

    await waitFor(() => expect(screen.getByTestId('upgrade-members-btn')).toBeTruthy());
    expect(screen.getByTestId('upgrade-members-btn').textContent).toBe('Limit reached');

    fireEvent.click(screen.getByTestId('upgrade-members-btn'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/member limit/i)).toBeTruthy();     // cap message stays
    expect(within(dialog).getByTestId('ask-owner-note')).toBeTruthy();
    expect(within(dialog).queryByText('Upgrade to Pro')).toBeNull();

    fireEvent.click(within(dialog).getByText('Got it'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // The member cap is create_invite's "OWNER-TIER, NOT INVITER-TIER" rule. A hub whose
  // owner pays has 15 seats regardless of what the person looking at it is on.
  it('unresolved hubPlan: no cap computed against the free fallback of 2', async () => {
    mockHubPlan = null;
    render(<MembersSection />);
    await waitFor(() => expect(screen.getByTestId('invite-member-btn')).toBeTruthy());
    expect(screen.queryByTestId('upgrade-members-btn')).toBeNull();
    expect(screen.getByTestId('member-count').textContent).toBe('2');   // no "of N" yet
  });

  // The inverse bug on the member axis: create_invite resolves the OWNER's tier, so a
  // paid hub has 15 seats no matter who is looking at the invite form.
  it('PAID hub, NON-OWNER at 2 members: no cap, no CTA, no ask-owner line', async () => {
    mockHubPlan = 'pro';
    mockIsOwner = false;   // 2 default members — the FREE cap, but this hub is paid
    render(<MembersSection />);

    await waitFor(() => expect(screen.getByTestId('member-count').textContent).toBe('2 of 15'));
    expect(screen.queryByTestId('upgrade-members-btn')).toBeNull();
    expect(screen.queryByTestId('ask-owner-note')).toBeNull();
  });

  it('pro cap is 15, not 6 — 6 members still allows inviting', async () => {
    mockHubPlan = 'pro';
    mockMembersList = Array.from({ length: 6 }, (_, i) => ({
      id: `mem-${i}`, user_id: `user-${i}`, role: i === 0 ? 'owner' : 'standard',
      joined_at: `2026-0${i + 1}-01T00:00:00Z`, users: { name: `M${i}`, email: `m${i}@test.com` },
    }));
    render(<MembersSection />);
    await waitFor(() => expect(screen.getByTestId('invite-member-btn')).toBeTruthy());
    expect(screen.queryByTestId('upgrade-members-btn')).toBeNull();
  });

  it('excludes expired pending invites from the list and the cap count', async () => {
    mockHubPlan    = 'free';
    mockMembersList = [defaultMembers[0]];   // owner only → 1 active member
    mockGetInvites.mockResolvedValue({
      data: [
        { id: 'inv-exp',  invited_email: 'expired@test.com', role: 'standard', status: 'pending', expires_at: pastISO() },
        { id: 'inv-live', invited_email: 'live@test.com',    role: 'standard', status: 'pending', expires_at: futureISO() },
      ],
      error: null,
    });
    render(<MembersSection />);
    // The live invite shows; the expired one does not.
    await waitFor(() => expect(screen.getByText('live@test.com')).toBeTruthy());
    expect(screen.queryByText('expired@test.com')).toBeNull();
    // Count = 1 active + 1 live pending = 2 = free cap → at limit, upgrade shown.
    expect(screen.getByTestId('upgrade-members-btn')).toBeTruthy();
    expect(screen.queryByTestId('invite-member-btn')).toBeNull();
  });
});
