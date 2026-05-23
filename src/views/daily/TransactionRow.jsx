/**
 * views/daily/TransactionRow.jsx
 *
 * Single transaction row for DailyView.
 * Shows category, description, amount, logged_by_name, delete button.
 * Disabled during optimistic writes and explicit disabled prop.
 *
 * @param {Transaction} tx
 * @param {function}    fmt
 * @param {function}    onDelete  — (id) => void
 * @param {boolean}     disabled
 */

import { useState } from 'react';

export function TransactionRow({ tx, fmt, onDelete, disabled, deleting, isLast }) {
  const [hoveredDelete, setHoveredDelete] = useState(false);
  const isIncome   = tx.type === 'income';
  const isDisabled = disabled || tx._optimistic === true;

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

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 12 }}>
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
          disabled={isDisabled}
          aria-label="Delete transaction"
          onMouseEnter={() => !isDisabled && setHoveredDelete(true)}
          onMouseLeave={() => setHoveredDelete(false)}
          style={{
            background:   'none',
            border:       'none',
            borderRadius: 8,
            padding:      '6px 8px',
            cursor:       isDisabled ? 'not-allowed' : 'pointer',
            opacity:      isDisabled ? 0.5 : 1,
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
      </div>
    </div>
  );
}
