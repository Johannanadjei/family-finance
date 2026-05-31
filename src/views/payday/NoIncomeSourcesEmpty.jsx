/**
 * views/payday/NoIncomeSourcesEmpty.jsx — current-month empty state.
 *
 * Shown on a month with no income sources yet. Offers two paths:
 *  - "Copy from <last month>" — STUBBED in Phase 2A (calls onCopyFromLast, which
 *    shows a "coming soon" toast); fully wired in 2B.
 *  - "+ Add manually" — opens the add-income flow (Settings) for this month.
 *
 * Pure display: receives labels + callbacks as props.
 *
 * @param {string}   monthLabel      — e.g. "June 2026"
 * @param {string}   lastMonthLabel  — e.g. "May 2026"
 * @param {function} onCopyFromLast  — stub handler (2A)
 * @param {function} onAddManually   — opens add-income flow
 */

export function NoIncomeSourcesEmpty({ monthLabel, lastMonthLabel, onCopyFromLast, onAddManually }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 16px' }}>
      <p style={{ fontSize: 36, margin: '0 0 12px' }}>💜</p>
      <p style={{ fontSize: 16, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: '0 0 6px' }}>
        No income tracked for {monthLabel} yet
      </p>
      <p style={{ fontSize: 15, color: 'var(--c-muted, #6b7280)', margin: '0 0 20px', lineHeight: 1.5 }}>
        Carry your sources over from last month, or add one manually.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 280, margin: '0 auto' }}>
        <button
          data-testid="copy-from-last-btn"
          onClick={onCopyFromLast}
          style={{
            padding: '12px 24px', borderRadius: 12, border: '1.5px solid var(--c-border, #e5e7eb)',
            background: 'var(--c-card, #ffffff)', color: 'var(--c-text, #1c1917)',
            fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif",
          }}
        >
          Copy from {lastMonthLabel}
        </button>
        <button
          data-testid="add-manually-btn"
          onClick={onAddManually}
          style={{
            padding: '12px 24px', borderRadius: 12, border: 'none',
            background: 'var(--c-primary, #064e3b)',
            color: 'var(--c-btn-text, #ffffff)', fontSize: 15, fontWeight: 800, cursor: 'pointer',
            fontFamily: "'Nunito', sans-serif",
          }}
        >
          + Add manually
        </button>
      </div>
    </div>
  );
}
