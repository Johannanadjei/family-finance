/**
 * views/settings/MemberRow.jsx
 *
 * Pure display row for a single hub member. Extracted from MembersSection so that
 * file stays under its size limit. Receives everything as props — no context, no
 * calculation. The remove/confirm state lives in MembersSection; this row only
 * renders the current state and reports clicks up.
 *
 * @param {object}   member        budget_centre_members row (with joined users)
 * @param {boolean}  showBorder    draw a bottom divider (false for the last item)
 * @param {boolean}  canManage     caller can manage members (owner)
 * @param {boolean}  removing      a remove for this row is in flight
 * @param {boolean}  confirming    show the inline "Remove X?" confirmation
 * @param {function} onAskRemove   first Remove click → ask for confirmation
 * @param {function} onConfirmRemove  confirmed Yes
 * @param {function} onCancelRemove   No / dismiss confirmation
 */

import { ROLE_LABELS } from '../../lib/roles';

export function MemberRow({ member, showBorder, canManage, removing, confirming, onAskRemove, onConfirmRemove, onCancelRemove }) {
  const displayName = member.users?.name?.trim() || member.users?.email || 'Unknown';
  const isOwner     = member.role === 'owner';

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, marginBottom: 10, borderBottom: showBorder ? '1px solid var(--c-border, #e5e7eb)' : 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--c-accent-light, #f0fdf4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: 'var(--c-primary, #064e3b)', flexShrink: 0 }}>
          {displayName[0].toUpperCase()}
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: 'var(--c-text, #1c1917)' }}>{displayName}</p>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--c-muted, #6b7280)' }}>{ROLE_LABELS[member.role] || member.role}</p>
        </div>
      </div>
      {canManage && !isOwner && (
        confirming ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-muted, #6b7280)', whiteSpace: 'nowrap' }}>Remove {displayName}?</span>
            <button data-testid={`confirm-remove-member-${member.id}`}
              onClick={onConfirmRemove}
              style={{ background: 'var(--c-danger, #dc2626)', border: 'none', borderRadius: 6, padding: '3px 8px', color: 'var(--c-btn-text, #ffffff)', fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}>
              Yes
            </button>
            <button data-testid={`cancel-remove-member-${member.id}`}
              onClick={onCancelRemove}
              style={{ background: 'var(--c-border, #e5e7eb)', border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}>
              No
            </button>
          </div>
        ) : (
          <button data-testid={`remove-member-${member.id}`} onClick={onAskRemove}
            disabled={removing} aria-label={`Remove ${displayName}`}
            style={{ background: 'none', border: 'none', cursor: removing ? 'not-allowed' : 'pointer', color: 'var(--c-danger, #dc2626)', padding: '4px 8px', fontSize: 12, fontWeight: 700, fontFamily: "'Nunito', sans-serif" }}>
            {removing ? '…' : 'Remove'}
          </button>
        )
      )}
    </div>
  );
}
