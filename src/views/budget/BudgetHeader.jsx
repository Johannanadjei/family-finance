/**
 * views/budget/BudgetHeader.jsx
 *
 * Budget screen header: period navigation + the planned/spent summary card.
 * Pure display — receives `fmt`, the period label, the (recomputed) totals, and
 * the nav-bound flags; emits onPrev/onNext. No cycle/guard logic lives here.
 *
 * Extracted from BudgetView (Commit 8) to keep that orchestrator within the
 * 200-line audit limit once cycle nav + the past-period guard landed.
 *
 * @param {string}   periodLabel — viewed cycle's name, e.g. "May 2026"
 * @param {function} fmt
 * @param {number}   fixedTotal  — planned (Σ budget_amount of the viewed cycle)
 * @param {number}   fixedSpent  — spent against the viewed cycle's fixed categories
 * @param {boolean}  isLatest    — newest cycle → disable Next
 * @param {boolean}  isOldest    — oldest cycle → disable Prev
 * @param {function} onPrev      — go to previous (older) period
 * @param {function} onNext      — go to next (newer) period
 */

export function BudgetHeader({ periodLabel, fmt, fixedTotal, fixedSpent, isLatest, isOldest, onPrev, onNext }) {
  return (
    <>
      {/* Period navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button onClick={onPrev} aria-label="Previous period" disabled={isOldest}
          style={{ background: 'none', border: 'none', padding: '8px', cursor: isOldest ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isOldest ? 'var(--c-border, #e5e7eb)' : 'var(--c-primary, #064e3b)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <p data-testid="budget-period-label" style={{ fontSize: 16, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: 0 }}>
          {periodLabel}
        </p>
        <button onClick={onNext} aria-label="Next period" disabled={isLatest}
          style={{ background: 'none', border: 'none', padding: '8px', cursor: isLatest ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isLatest ? 'var(--c-border, #e5e7eb)' : 'var(--c-primary, #064e3b)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>

      {/* Summary header */}
      <div style={{ background: 'linear-gradient(135deg, var(--c-header-from,#064e3b), var(--c-header-to,#0d7060))', borderRadius: 16, padding: '16px 18px', marginBottom: 16, color: '#fff', boxShadow: 'var(--c-shadow)' }}>
        <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: 'rgba(255,255,255,.7)', margin: '0 0 12px', textTransform: 'uppercase' }}>
          Budget Overview
        </p>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', margin: '0 0 2px' }}>Planned</p>
            <p data-testid="budget-total-planned" style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>{fmt(fixedTotal)}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', margin: '0 0 2px' }}>Spent</p>
            <p data-testid="budget-total-spent" style={{ fontSize: 22, fontWeight: 900, margin: 0, color: fixedSpent > fixedTotal ? 'var(--c-danger-light, #fca5a5)' : 'var(--c-success-light, #6ee7b7)' }}>{fmt(fixedSpent)}</p>
          </div>
        </div>
      </div>
    </>
  );
}
