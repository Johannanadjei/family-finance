/**
 * views/payday/UnassignedIncomeRow.jsx
 *
 * Income logged through the "+" button as "Other / one-off" — real money with no
 * income source attached (income_source_id NULL). It counts toward the period total
 * exactly like source-linked income; this row is what makes it VISIBLE on the tracker.
 *
 * WHY IT EXISTS (#4b): Payday used to count only source-linked receipts, so income
 * logged via "+" before its source existed was simply absent. The tracker read
 * 0 received while Home read the full amount, mark-received was tapped to "fix" it,
 * and a duplicate transaction was created. Showing the money is the fix.
 *
 * Pure display: receives a pre-formatted string (CLAUDE.md §4) and renders nothing
 * when there is no unassigned income.
 *
 * @param {string} amount — already run through fmt() by the caller
 */

export function UnassignedIncomeRow({ amount }) {
  if (!amount) return null;

  return (
    <div
      data-testid="payday-unassigned-income"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--c-card, #ffffff)', borderRadius: 16, padding: '16px 18px',
        marginBottom: 12, boxShadow: 'var(--c-shadow)',
        borderLeft: '3px solid var(--c-border, #e5e7eb)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-text, #1c1917)', margin: 0 }}>
          Unassigned income
        </p>
        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-muted, #6b7280)', margin: '2px 0 0' }}>
          Logged with the + button, not linked to a source
        </p>
      </div>
      <p data-testid="payday-unassigned-amount" style={{ fontSize: 16, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: 0, flexShrink: 0 }}>
        {amount}
      </p>
    </div>
  );
}
