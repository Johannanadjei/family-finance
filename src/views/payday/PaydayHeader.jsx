/**
 * views/payday/PaydayHeader.jsx
 *
 * Payday screen header: period navigation + the received/pending summary card.
 * Pure display — the view formats nothing here itself; it receives `fmt` plus
 * the period flags and totals, and emits onPrev/onNext for navigation.
 *
 * Cycle-migrated (Commit 5): nav is bounded by the cycle list, so the single
 * old `isCurrentMonth` flag (which conflated "newest" with "today's") split into
 * `isCurrent` (card display) and `isLatest`/`isOldest` (Next/Prev disabling).
 *
 * @param {string}   periodLabel   — the viewed cycle's name, e.g. "May 2026"
 * @param {boolean}  isCurrent     — viewing today's cycle → Received + Pending split
 * @param {boolean}  isFuture      — viewing a future cycle → hide the summary card
 * @param {boolean}  isLatest      — newest cycle in the list → disable Next
 * @param {boolean}  isOldest      — oldest cycle in the list → disable Prev
 * @param {number}   totalReceived — current received total
 * @param {number}   totalPending  — current pending total
 * @param {number}   totalIncome   — past-period income (tx-derived)
 * @param {function} fmt           — currency formatter
 * @param {function} onPrev        — go to previous (older) period
 * @param {function} onNext        — go to next (newer) period
 */

export function PaydayHeader({ periodLabel, isCurrent, isFuture, isLatest, isOldest, totalReceived, totalPending, totalIncome, fmt, onPrev, onNext }) {
  return (
    <>
      {/* Period navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button
          onClick={onPrev}
          aria-label="Previous period"
          disabled={isOldest}
          style={{ background: 'none', border: 'none', padding: '8px', cursor: isOldest ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isOldest ? 'var(--c-border, #e5e7eb)' : 'var(--c-primary, #064e3b)' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <p data-testid="payday-period-label" style={{ fontSize: 16, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: 0 }}>
          {periodLabel}
        </p>
        <button
          onClick={onNext}
          aria-label="Next period"
          disabled={isLatest}
          style={{ background: 'none', border: 'none', padding: '8px', cursor: isLatest ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isLatest ? 'var(--c-border, #e5e7eb)' : 'var(--c-primary, #064e3b)' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>

      {/* Summary card — hidden for future periods (nothing to total yet) */}
      {!isFuture && (
        <div style={{ background: 'linear-gradient(135deg, var(--c-header-from,#064e3b), var(--c-header-to,#0d7060))', borderRadius: 16, padding: '16px 18px', marginBottom: 16, color: '#fff', boxShadow: 'var(--c-shadow)', border: '1px solid rgba(255,255,255,0.2)' }}>
          {isCurrent ? (
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
