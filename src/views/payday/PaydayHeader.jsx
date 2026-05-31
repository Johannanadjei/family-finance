/**
 * views/payday/PaydayHeader.jsx
 *
 * Payday screen header: month navigation + the received/pending summary card.
 * Pure display — the view formats nothing here itself; it receives `fmt` plus
 * the month flags and totals, and emits onPrev/onNext for navigation.
 *
 * Extracted from PaydayView to keep that orchestrator within the 200-line audit
 * limit once the 2B rollforward flow landed (same move as IncomeSourcesSection).
 *
 * @param {string}   monthLabel     — formatted active month, e.g. "May 2026"
 * @param {boolean}  isCurrentMonth — disables Next; shows Received + Pending split
 * @param {boolean}  isFutureMonth  — hides the summary card entirely
 * @param {number}   totalReceived  — current-month received total
 * @param {number}   totalPending   — current-month pending total
 * @param {number}   totalIncome    — past-month income (tx-derived)
 * @param {function} fmt            — currency formatter
 * @param {function} onPrev         — go to previous month
 * @param {function} onNext         — go to next month
 */

export function PaydayHeader({ monthLabel, isCurrentMonth, isFutureMonth, totalReceived, totalPending, totalIncome, fmt, onPrev, onNext }) {
  return (
    <>
      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button
          onClick={onPrev}
          aria-label="Previous month"
          style={{ background: 'none', border: 'none', padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-primary, #064e3b)' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <p data-testid="payday-month-label" style={{ fontSize: 16, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: 0 }}>
          {monthLabel}
        </p>
        <button
          onClick={onNext}
          aria-label="Next month"
          disabled={isCurrentMonth}
          style={{ background: 'none', border: 'none', padding: '8px', cursor: isCurrentMonth ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isCurrentMonth ? 'var(--c-border, #e5e7eb)' : 'var(--c-primary, #064e3b)' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>

      {/* Summary card — hidden for future months (nothing to total yet) */}
      {!isFutureMonth && (
        <div style={{ background: 'linear-gradient(135deg, var(--c-header-from,#064e3b), var(--c-header-to,#0d7060))', borderRadius: 16, padding: '16px 18px', marginBottom: 16, color: '#fff', boxShadow: 'var(--c-shadow)', border: '1px solid rgba(255,255,255,0.2)' }}>
          {isCurrentMonth ? (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,.7)', margin: '0 0 4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Received</p>
                <p data-testid="payday-total-received" style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>{fmt(totalReceived)}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,.7)', margin: '0 0 4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Pending</p>
                <p data-testid="payday-total-pending" style={{ fontSize: 24, fontWeight: 900, margin: 0, color: totalPending > 0 ? 'var(--c-warning, #fbbf24)' : 'var(--c-success-light, #6ee7b7)' }}>{fmt(totalPending)}</p>
              </div>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,.7)', margin: '0 0 4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Received</p>
              <p data-testid="payday-total-received" style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>{fmt(totalIncome)}</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
