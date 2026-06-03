/**
 * views/daily/TransactionRow.jsx
 *
 * Single transaction row for DailyView and LogView.
 * Shows category, description, amount, logged_by_name, delete button, and — when
 * an `onMove` handler is supplied — a kebab (⋯) menu hosting "Move to period"
 * (Commit 12). The kebab is the home for transaction-level corrective actions;
 * future actions (edit, duplicate) slot into the same menu without redesigning the
 * row. Delete stays as its own affordance.
 * Disabled during optimistic writes and explicit disabled prop.
 *
 * @param {Transaction} tx
 * @param {function}    fmt
 * @param {function}    onDelete  — (id) => void
 * @param {function}    [onMove]  — (id) => void — opens the move-to-period flow
 * @param {boolean}     disabled
 * @param {boolean}     [moving]  — a move is in flight for this row
 */

import { useState } from 'react';

export function TransactionRow({ tx, fmt, onDelete, onMove, disabled, deleting, moving, isLast }) {
  const [hoveredDelete, setHoveredDelete] = useState(false);
  const [menuOpen,      setMenuOpen]      = useState(false);
  const isIncome   = tx.type === 'income';
  const isDisabled = disabled || tx._optimistic === true;
  // The kebab (move) deliberately ignores the `disabled` prop's past-period
  // component: moving FROM a past period is allowed via the confirm guard (Commit
  // 12 / Decision 6). It's still blocked while the row is optimistic or has a
  // delete/move in flight.
  const moveDisabled = tx._optimistic === true || moving || deleting;

  const handleMove = () => { setMenuOpen(false); onMove(tx.id); };

  return (
    <div style={{
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'space-between',
      padding:        '12px 0',
      borderBottom:   isLast ? 'none' : '1px solid var(--c-border, #e5e7eb)',
      opacity:        deleting ? 0.4 : tx._optimistic ? 0.6 : 1,
      transition:     'opacity .2s',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--c-text, #1c1917)', margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {tx.category_name || 'Other'}
        </p>
        {tx.description ? (
          <p style={{ fontSize: 12, color: 'var(--c-muted, #6b7280)', margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {tx.description}
          </p>
        ) : null}
        {tx.logged_by_name ? (
          <p style={{ fontSize: 11, color: 'var(--c-muted, #9ca3af)', margin: 0 }}>
            {tx.logged_by_name}
          </p>
        ) : null}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 12, position: 'relative' }}>
        <span
          data-testid={`tx-amount-${tx.id}`}
          style={{
            fontSize:   15,
            fontWeight: 900,
            color:      isIncome ? 'var(--c-success, #059669)' : 'var(--c-text, #1c1917)',
          }}
        >
          {isIncome ? '+' : '-'}{fmt(tx.amount)}
        </span>
        <button
          data-testid={`tx-delete-${tx.id}`}
          onClick={() => onDelete(tx.id)}
          disabled={isDisabled || moving}
          aria-label="Delete transaction"
          onMouseEnter={() => !isDisabled && setHoveredDelete(true)}
          onMouseLeave={() => setHoveredDelete(false)}
          style={{
            background:   'none',
            border:       'none',
            borderRadius: 8,
            padding:      '6px 8px',
            cursor:       isDisabled || moving ? 'not-allowed' : 'pointer',
            opacity:      isDisabled || moving ? 0.5 : 1,
            color:        hoveredDelete ? 'var(--c-danger, #dc2626)' : 'var(--c-muted, #9ca3af)',
            display:      'flex',
            alignItems:   'center',
            transition:   'color .15s',
          }}
        >
          {deleting ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ animation: 'spin 0.7s linear infinite' }}>
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="40 20" strokeLinecap="round"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>

        {/* Kebab menu — only when a move handler is wired (LogView / DailyView) */}
        {onMove && (
          <button
            data-testid={`tx-menu-${tx.id}`}
            onClick={() => setMenuOpen(o => !o)}
            disabled={moveDisabled}
            aria-label="Transaction actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            style={{
              background:   'none',
              border:       'none',
              borderRadius: 8,
              padding:      '6px 6px',
              cursor:       moveDisabled ? 'not-allowed' : 'pointer',
              opacity:      moveDisabled ? 0.5 : 1,
              color:        'var(--c-muted, #9ca3af)',
              display:      'flex',
              alignItems:   'center',
            }}
          >
            {moving ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ animation: 'spin 0.7s linear infinite' }}>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="40 20" strokeLinecap="round"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
              </svg>
            )}
          </button>
        )}

        {menuOpen && onMove && (
          <>
            {/* Click-catcher closes the menu on any outside tap */}
            <div onClick={() => setMenuOpen(false)} aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
            <div role="menu" style={{
              position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 21,
              background: 'var(--c-card, #fff)', borderRadius: 12, minWidth: 168,
              border: '1px solid var(--c-border, #e5e7eb)', boxShadow: 'var(--c-shadow)',
              overflow: 'hidden',
            }}>
              <button
                role="menuitem"
                data-testid={`tx-move-${tx.id}`}
                onClick={handleMove}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '11px 14px', background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 14, fontWeight: 700, color: 'var(--c-text, #1c1917)',
                  fontFamily: "'Nunito', sans-serif", textAlign: 'left',
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/><path d="M11 15l2 2 4-4" opacity="0.9"/>
                </svg>
                Move to period
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
