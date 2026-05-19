/**
 * views/home/BudgetHealthBar.jsx
 *
 * Shows budget health percentage and status.
 * Neutral state when totalSpent === 0 — no spending recorded yet.
 * Receives totalSpent to determine whether to show real data.
 */

export function BudgetHealthBar({ healthPct, budgetStatus, totalSpent }) {
  const hasSpending = totalSpent > 0;

  return (
    <div style={{ background: 'var(--c-card,#fff)', borderRadius: 16, padding: '16px 18px', marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--c-text,#1c1917)', margin: 0 }}>Budget Health</p>
        {hasSpending && (
          <p style={{ fontSize: 12, fontWeight: 800, color: budgetStatus.color, margin: 0 }}>{budgetStatus.label}</p>
        )}
      </div>
      <div style={{ height: 8, background: 'var(--c-border,#e5e7eb)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          height:     '100%',
          width:      hasSpending ? `${healthPct}%` : '0%',
          background: budgetStatus.color,
          borderRadius: 4,
          transition: 'width .6s ease',
        }} />
      </div>
      <p style={{ fontSize: 11, color: 'var(--c-muted,#6b7280)', margin: '6px 0 0' }}>
        {hasSpending ? `${healthPct}% of monthly budget remaining` : 'No spending recorded yet'}
      </p>
    </div>
  );
}
