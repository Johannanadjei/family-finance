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

export function TransactionRow({ tx, fmt, onDelete, disabled, isLast }) {
  const isIncome   = tx.type === 'income';
  const isDisabled = disabled || tx._optimistic === true;

  return (
    <div style={{
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'space-between',
      padding:        '12px 0',
      borderBottom:   isLast ? 'none' : '1px solid var(--c-border, #e5e7eb)',
      opacity:        tx._optimistic ? 0.6 : 1,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--c-text, #1c1917)', margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {tx.category_name}
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
          style={{
            background: 'var(--c-danger-light, #fef2f2)',
            border:     'none',
            borderRadius: 8,
            padding:    '6px 8px',
            fontSize:   13,
            cursor:     isDisabled ? 'not-allowed' : 'pointer',
            opacity:    isDisabled ? 0.5 : 1,
            color:      'var(--c-danger, #dc2626)',
          }}
        >
          🗑
        </button>
      </div>
    </div>
  );
}
