/**
 * views/payday/PastIncomeCard.jsx — read-only income card for past months.
 *
 * Renders a confirmed income transaction (from the month-scoped txs table).
 * No Confirm/Mark CTAs and no edit controls — past months are read-only.
 * Pure display: receives pre-formatted strings (name, amount) — never calls fmt.
 */

export function PastIncomeCard({ name, amount }) {
  return (
    <div
      data-testid="past-income-card"
      style={{
        background:   'var(--c-card, #fff)',
        borderRadius: 16,
        padding:      '16px 18px',
        marginBottom: 12,
        boxShadow:    'var(--c-shadow)',
        border:       '1px solid var(--c-border, #e5e7eb)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-text, #1c1917)', margin: '0 0 6px' }}>{name}</p>
          <span style={{
            display:      'inline-flex',
            alignItems:   'center',
            gap:          5,
            fontSize:     12,
            fontWeight:   700,
            color:        'var(--c-success, #059669)',
            background:   'var(--c-accent-light, #f0fdf4)',
            borderRadius: 8,
            padding:      '3px 8px',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Received
          </span>
        </div>
        <p style={{ fontSize: 20, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: 0 }}>{amount}</p>
      </div>
    </div>
  );
}
