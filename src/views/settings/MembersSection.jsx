import { useState, useEffect, useCallback } from 'react';
import { useBudgetCentreContext }           from '../../context/BudgetCentreContext';
import { useFinanceContext }                from '../../context/FinanceContext';
import { ROLE_LABELS, ROLE_DESCRIPTIONS, INVITABLE_ROLES, MAX_MEMBERS } from '../../lib/roles';
import { selectStyle }                      from '../../lib/selectStyle';
const card       = { background: 'var(--c-card, #fff)', borderRadius: 16, padding: '16px 18px', boxShadow: 'var(--c-shadow)', marginBottom: 16 };
const label      = { fontSize: 13, fontWeight: 900, color: 'var(--c-muted, #6b7280)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 0.8 };
const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--c-border, #e5e7eb)', fontSize: 14, fontWeight: 700, marginBottom: 8, boxSizing: 'border-box', background: 'var(--c-input-bg, #f9fafb)', fontFamily: "'Nunito', sans-serif", color: 'var(--c-text, #1c1917)' };
export function MembersSection() {
  const { members, currentMemberRole, can, inviteMember, removeMember, getInvites, cancelInvite, centre } = useBudgetCentreContext();
  const { userPlan } = useFinanceContext();

  const [invites,       setInvites]       = useState([]);
  const [invitesLoaded, setInvitesLoaded] = useState(false);
  const [showForm,      setShowForm]      = useState(false);
  const [email,         setEmail]         = useState('');
  const [role,          setRole]          = useState('standard');
  const [sending,       setSending]       = useState(false);
  const [sendError,     setSendError]     = useState(null);
  const [sentLink,      setSentLink]      = useState(null);
  const [sentEmail,     setSentEmail]     = useState(null);
  const [linkCopied,    setLinkCopied]    = useState(false);
  const [removing,      setRemoving]      = useState(null);
  const [removeError,   setRemoveError]   = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [cancelling,    setCancelling]    = useState(null);
  const [cancelError,   setCancelError]   = useState(null);

  const plan         = userPlan || 'free';
  const limit        = MAX_MEMBERS[plan] ?? 2;
  const activeCount  = members.length;
  const pendingCount = invites.filter(i => i.status === 'pending').length;
  const atLimit      = activeCount + pendingCount >= limit;

  const loadInvites = useCallback(async () => {
    const { data } = await getInvites();
    setInvites(data || []);
    setInvitesLoaded(true);
  }, [getInvites]);

  useEffect(() => { loadInvites(); }, [loadInvites]);

  const handleSendInvite = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) { setSendError('Please enter a valid email address'); return; }
    setSending(true); setSendError(null);
    const { data, error } = await inviteMember({ email: trimmed, role });
    setSending(false);
    if (error) { setSendError(error.message || 'Could not send invite. Please try again.'); return; }
    setSentLink(`${window.location.origin}/join?token=${data?.token}`);
    setSentEmail(trimmed);
    setLinkCopied(false);
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
    setCancelError(null);
    setInvites(prev => prev.filter(i => i.id !== inviteId));
    const { error } = await cancelInvite(inviteId);
    setCancelling(null);
    if (error) {
      setCancelError(error.message || 'Could not cancel invite. Please try again.');
      await loadInvites();
      return;
    }
  };

  const canManage      = can('manageMembers');
  const pendingInvites = invites.filter(i => i.status === 'pending');

  return (
    <div style={card}>
      <p style={label}>Members</p>
      {members.map((m, i) => {
        const displayName = m.users?.name?.trim() || m.users?.email || 'Unknown';
        return (
        <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, marginBottom: 10, borderBottom: i < members.length - 1 || pendingInvites.length > 0 ? '1px solid var(--c-border, #e5e7eb)' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--c-accent-light, #f0fdf4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: 'var(--c-primary, #064e3b)', flexShrink: 0 }}>
              {displayName[0].toUpperCase()}
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: 'var(--c-text, #1c1917)' }}>{displayName}</p>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--c-muted, #6b7280)' }}>{ROLE_LABELS[m.role] || m.role}</p>
            </div>
          </div>
          {canManage && m.role !== 'owner' && (
            confirmRemove === m.id ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-muted, #6b7280)', whiteSpace: 'nowrap' }}>Remove {displayName}?</span>
                <button data-testid={`confirm-remove-member-${m.id}`}
                  onClick={() => { setConfirmRemove(null); handleRemove(m.id, m.role); }}
                  style={{ background: 'var(--c-danger, #dc2626)', border: 'none', borderRadius: 6, padding: '3px 8px', color: 'var(--c-btn-text, #ffffff)', fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}>
                  Yes
                </button>
                <button data-testid={`cancel-remove-member-${m.id}`}
                  onClick={() => setConfirmRemove(null)}
                  style={{ background: 'var(--c-border, #e5e7eb)', border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}>
                  No
                </button>
              </div>
            ) : (
              <button data-testid={`remove-member-${m.id}`} onClick={() => setConfirmRemove(m.id)}
                disabled={removing === m.id} aria-label={`Remove ${displayName}`}
                style={{ background: 'none', border: 'none', cursor: removing === m.id ? 'not-allowed' : 'pointer', color: 'var(--c-danger, #dc2626)', padding: '4px 8px', fontSize: 12, fontWeight: 700, fontFamily: "'Nunito', sans-serif" }}>
                {removing === m.id ? '…' : 'Remove'}
              </button>
            )
          )}
        </div>
        );
      })}
      {removeError  && <p style={{ fontSize: 12, color: 'var(--c-danger, #dc2626)', margin: '0 0 8px', fontWeight: 700 }}>{removeError}</p>}
      {cancelError  && <p style={{ fontSize: 12, color: 'var(--c-danger, #dc2626)', margin: '0 0 8px', fontWeight: 700 }}>{cancelError}</p>}
      {invitesLoaded && pendingInvites.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 11, fontWeight: 900, color: 'var(--c-muted, #6b7280)', textTransform: 'uppercase', letterSpacing: 0.6, margin: '0 0 8px' }}>Pending Invites</p>
          {pendingInvites.map(inv => (
            <div key={inv.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--c-border, #e5e7eb)' }}>
              <div>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--c-text, #1c1917)' }}>{inv.invited_email}</p>
                <p style={{ margin: 0, fontSize: 11, color: 'var(--c-muted, #6b7280)' }}>{ROLE_LABELS[inv.role]} · expires {inv.expires_at ? new Date(inv.expires_at).toLocaleDateString('en-GB') : '—'}</p>
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
        <div style={{ background: 'var(--c-accent-light, #f0fdf4)', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
          <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 900, color: 'var(--c-text, #1c1917)' }}>Invite link ready</p>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--c-muted, #6b7280)', fontWeight: 600 }}>
            No email is sent automatically. Copy this link and share it directly with <strong style={{ color: 'var(--c-text, #1c1917)' }}>{sentEmail}</strong> via WhatsApp, SMS, or email.
          </p>
          <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--c-muted, #6b7280)', wordBreak: 'break-all', background: 'var(--c-card, #fff)', borderRadius: 6, padding: '6px 8px' }}>{sentLink}</p>
          <button
            onClick={() => { navigator.clipboard?.writeText(sentLink); setLinkCopied(true); }}
            style={{ width: '100%', padding: '11px', borderRadius: 10, border: 'none', background: linkCopied ? 'var(--c-success, #059669)' : 'var(--c-primary, #064e3b)', color: 'var(--c-btn-text, #ffffff)', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif", transition: 'background .2s' }}>
            {linkCopied ? 'Copied!' : 'Copy Link'}
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
                style={{ ...inputStyle, ...selectStyle }}>
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
                  {sending ? 'Creating link…' : 'Create Invite Link'}
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
