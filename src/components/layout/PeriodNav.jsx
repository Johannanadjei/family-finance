/**
 * components/layout/PeriodNav.jsx
 *
 * Shared period navigation: prev / period-label / next. Used by all four
 * cycle-navigated screens (Budget, Payday, Daily, Log) so the nav — and the
 * history-gate upgrade affordance baked into it — is a single implementation
 * that can never drift across views.
 *
 * History gate (D6/D8): when `historyLocked` is true the prev arrow keeps its
 * disabled (greyed) LOOK but becomes tappable → it opens the HISTORY_CAP_BODY
 * UpgradeModal (owned here) instead of navigating. Same visual, tier-divergent
 * behaviour. The view computes `historyLocked` (free user + older cycles hidden
 * + on the oldest VISIBLE cycle) and passes it down; the modal state lives here.
 *
 * @param {string}   periodLabel — viewed cycle's name, e.g. "May 2026"
 * @param {boolean}  isOldest    — oldest visible cycle → disable (or lock) Prev
 * @param {boolean}  isLatest    — newest cycle → disable Next
 * @param {function} onPrev      — go to previous (older) period
 * @param {function} onNext      — go to next (newer) period
 * @param {boolean}  historyLocked — prev becomes a tappable upgrade affordance
 * @param {string}   labelTestId — per-view data-testid for the label (e.g. "budget-period-label")
 */

import { useState }   from 'react';
import { UpgradeModal } from '../ui/UpgradeModal';
import { HISTORY_CAP_BODY } from '../../lib/planCopy';

export function PeriodNav({ periodLabel, isOldest, isLatest, onPrev, onNext, historyLocked = false, labelTestId }) {
  const [showHistoryUpgrade, setShowHistoryUpgrade] = useState(false);
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button
          onClick={historyLocked ? () => setShowHistoryUpgrade(true) : onPrev}
          aria-label="Previous period"
          data-testid={historyLocked ? 'upgrade-history-affordance' : undefined}
          disabled={isOldest && !historyLocked}
          style={{ background: 'none', border: 'none', padding: '8px', cursor: (historyLocked || !isOldest) ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isOldest ? 'var(--c-border, #e5e7eb)' : 'var(--c-primary, #064e3b)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <p data-testid={labelTestId} style={{ fontSize: 16, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: 0 }}>
          {periodLabel}
        </p>
        <button onClick={onNext} aria-label="Next period" disabled={isLatest}
          style={{ background: 'none', border: 'none', padding: '8px', cursor: isLatest ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isLatest ? 'var(--c-border, #e5e7eb)' : 'var(--c-primary, #064e3b)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>

      <UpgradeModal open={showHistoryUpgrade} onClose={() => setShowHistoryUpgrade(false)} body={HISTORY_CAP_BODY} />
    </>
  );
}
