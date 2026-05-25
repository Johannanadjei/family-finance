import { useState, useEffect, useCallback } from 'react';
import { useBudgetCentreContext }           from '../../context/BudgetCentreContext';
import { useFinanceContext }                from '../../context/FinanceContext';
import { ROLE_LABELS, ROLE_DESCRIPTIONS, INVITABLE_ROLES } from '../../lib/roles';

const MEMBER_LIMITS = { free: 2, pro: 6 };
const card       = { background: 'var(--c-card, #fff)', borderRadius: 16, padding: '16px 18px', boxShadow: 'var(--c-shadow)', marginBottom: 16 };
const label      = { fontSize: 13, fontWeight: 900, color: 'var(--c-muted, #6b7280)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 0.8 };
const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--c-border, #e5e7eb)', fontSize: 14, fontWeight: 700, marginBottom: 8, boxSizing: 'border-box', background: 'var(--c-input-bg, #f9fafb)', fontFamily: "'Nunito', sans-serif", color: 'var(--c-text, #1c1917)' };

export function MembersSection() {
  const { members, currentMemberRole, inviteMember, removeMember, getInvites, cancelInvite, centre } = useBudgetCentreContext();
  const { userPlan } = useFinanceContext();

  const [invites,       setInvites]       = useState([]);
  const [invitesLoaded, setInvitesLoaded] = useState(false);
  const [showForm,      setShowForm]      = useState(false);
  const [email,         setEmail]         = useState('');
  const [role,          setRole]          = useState('standard');
  const [sending,       setSending]       = useState(false);
  const [sendError,     setSendError]     = useState(null);
  const [sentLink,      setSentLink]      = useState(null);
  const [removing,      setRemoving]      = useState(null);
  const [removeError,   setRemoveError]   = useState(null);
  const [cancelling,    setCancelling]    = useState(null);

  const plan         = userPlan || 'free';
  const limit        = MEMBER_LIMITS[plan] ?? 2;
  const activeCount  = members.length;
  const pendingCount = invites.filter(i => i.status === 'pending').length;
  const atLimit      = activeCount + pendingCount >= limit;

  const loadInvites = useCallback(async () => {
    const { data } = await getInvites();
    setInvites(data || []);
    setInvitesLoaded(true);
  }, [centre?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadInvites(); }, [loadInvites]);

  const handleSendInvite = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) { setSendError('Please enter a valid email address'); return; }
    setSending(true); setSendError(null);
    const { data, error } = await inviteMember({ email: trimmed, role });
    setSending(false);
    if (error) { setSendError(error.message || 'Could not send invite. Please try again.'); return; }
    setSentLink(`${window.location.origin}/join?token=${data.token}`);
    setEmail(''); setRole('standard'); setShowForm(false);
    await loadInvites();
  };

  const handleRemove = async (memberId, memberRole) => {
    setRemoving(memberId); setRemoveError(null);
    const { error } = await removeMember(memberId, memberRole);
    setRemoving(null);
    if (error) setRemoveError(error.message);
  };

  const handleCancel = async (inviteId) => {
    setCancelling(inviteId);
    await cancelInvite(inviteId);
    setCancelling(null);
    await loadInvites();
  };

  const canManage      = currentMemberRole === 'owner';
  const pendingInvites = invites.filter(i => i.status === 'pending');

  return (
    <div style={card}>
      <p style={label}>Members</p>
      {members.map((m, i) => (
        <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, marginBottom: 10, borderBottom: i < members.length - 1 || pendingInvites.length > 0 ? '1px solid var(--c-border, #e5e7eb)' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--c-accent-light, #f0fdf4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: 'var(--c-primary, #064e3b)', flexShrink: 0 }}>
              {(m.users?.name || m.users?.email || '?')[0].toUpperCase()}
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: 'var(--c-text, #1c1917)' }}>{m.users?.name || m.users?.email || 'Unknown'}</p>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--c-muted, #6b7280)' }}>{ROLE_LABELS[m.role] || m.role}</p>
            </div>
          </div>
          {canManage && m.role !== 'owner' && (
            <button data-testid={`remove-member-${m.id}`} onClick={() => handleRemove(m.id, m.role)}
              disabled={removing === m.id} aria-label={`Remove ${m.users?.name || 'member'}`}
              style={{ background: 'none', border: 'none', cursor: removing === m.id ? 'not-allowed' : 'pointer', color: 'var(--c-danger, #dc2626)', padding: '4px 8px', fontSize: 12, fontWeight: 700, fontFamily: "'Nunito', sans-serif" }}>
              {removing === m.id ? '…' : 'Remove'}
            </button>
          )}
        </div>
      ))}
      {removeError && <p style={{ fontSize: 12, color: 'var(--c-danger, #dc2626)', margin: '0 0 8px', fontWeight: 700 }}>{removeError}</p>}
      {invitesLoaded && pendingInvites.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 11, fontWeight: 900, color: 'var(--c-muted, #6b7280)', textTransform: 'uppercase', letterSpacing: 0.6, margin: '0 0 8px' }}>Pending Invites</p>
          {pendingInvites.map(inv => (
            <div key={inv.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--c-border, #e5e7eb)' }}>
              <div>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--c-text, #1c1917)' }}>{inv.invited_email}</p>
                <p style={{ margin: 0, fontSize: 11, color: 'var(--c-muted, #6b7280)' }}>{ROLE_LABELS[inv.role]} · expires {new Date(inv.expires_at).toLocaleDateString('en-GB')}</p>
              </div>
              {canManage && (
                <button data-testid={`cancel-invite-${inv.id}`} onClick={() => handleCancel(inv.id)}
                  disabled={cancelling === inv.id}
                  style={{ background: 'none', border: 'none', cursor: cancelling === inv.id ? 'not-allowed' : 'pointer', color: 'var(--c-muted, #6b7280)', padding: '4px 8px', fontSize: 12, fontWeight: 700, fontFamily: "'Nunito', sans-serif" }}>
                  {cancelling === inv.id ? '…' : 'Cancel'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {sentLink && (
        <div style={{ background: 'var(--c-accent-light, #f0fdf4)', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
          <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 800, color: 'var(--c-text, #1c1917)' }}>Invite link ready — share it directly:</p>
          <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--c-muted, #6b7280)', wordBreak: 'break-all' }}>{sentLink}</p>
          <button onClick={() => { navigator.clipboard?.writeText(sentLink); setSentLink(null); }}
            style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--c-primary, #064e3b)', color: 'var(--c-btn-text, #ffffff)', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}>
            Copy Link
          </button>
        </div>
      )}
      {canManage && atLimit && (
        <div style={{ background: 'var(--c-bg, #f3f4f6)', borderRadius: 10, padding: '10px 14px', marginTop: 4 }}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--c-muted, #6b7280)', fontWeight: 700 }}>
            {plan === 'free' ? `Free plan allows ${limit} members. Upgrade to Pro for up to 6 members.` : `Maximum ${limit} members reached.`}
          </p>
        </div>
      )}
      {canManage && !atLimit && (
        <>
          {showForm ? (
            <div style={{ marginTop: 12 }}>
              <input data-testid="invite-email-input" type="email" value={email}
                onChange={e => { setEmail(e.target.value); setSendError(null); }}
                placeholder="Enter email address" style={inputStyle} />
              <select data-testid="invite-role-select" value={role} onChange={e => setRole(e.target.value)}
                style={{ ...inputStyle, appearance: 'none', WebkitAppearance: 'none' }}>
                {INVITABLE_ROLES.map(r => (
                  <option key={r} value={r}>{ROLE_LABELS[r]} — {ROLE_DESCRIPTIONS[r]}</option>
                ))}
              </select>
              {sendError && <p style={{ fontSize: 12, color: 'var(--c-danger, #dc2626)', margin: '0 0 8px', fontWeight: 700 }}>{sendError}</p>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
                <button onClick={() => { setShowForm(false); setSendError(null); }}
                  style={{ padding: '10px', borderRadius: 10, border: '1.5px solid var(--c-border, #e5e7eb)', background: 'var(--c-card, #ffffff)', color: 'var(--c-text, #1c1917)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}>
                  Cancel
                </button>
                <button data-testid="send-invite-btn" onClick={handleSendInvite} disabled={sending}
                  style={{ padding: '10px', borderRadius: 10, border: 'none', background: 'var(--c-primary, #064e3b)', color: 'var(--c-btn-text, #ffffff)', fontSize: 13, fontWeight: 800, cursor: sending ? 'not-allowed' : 'pointer', fontFamily: "'Nunito', sans-serif" }}>
                  {sending ? 'Sending…' : 'Generate Invite Link'}
                </button>
              </div>
            </div>
          ) : (
            <button data-testid="invite-member-btn" onClick={() => { setShowForm(true); setSentLink(null); }}
              style={{ marginTop: 8, width: '100%', padding: '10px', borderRadius: 10, border: '1.5px dashed var(--c-border, #e5e7eb)', background: 'transparent', color: 'var(--c-primary, #064e3b)', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}>
              + Invite Member
            </button>
          )}
        </>
      )}
    </div>
  );
}
