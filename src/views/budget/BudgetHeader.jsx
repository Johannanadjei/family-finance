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
 * @param {function} onNewPeriod — open the budget-period creator
 * @param {boolean}  canManage   — can('manageCycles'); false → disable create + reset
 * @param {boolean}  isFuture    — viewed period starts after today → show the reset kebab
 * @param {function} onReset     — open the reset-period confirm (future periods only)
 * @param {boolean}  historyLocked    — free user on the oldest VISIBLE cycle with older
 *                                       periods hidden (history gate); the disabled prev
 *                                       arrow becomes a tappable upgrade affordance
 * @param {function} onHistoryUpgrade — open the history UpgradeModal (when historyLocked)
 */

import { useState } from 'react';

export function BudgetHeader({ periodLabel, fmt, fixedTotal, fixedSpent, isLatest, isOldest, onPrev, onNext, onNewPeriod, canManage = false, isFuture = false, onReset, historyLocked = false, onHistoryUpgrade }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <>
      {/* Period navigation. When historyLocked, the prev arrow keeps its disabled
          (greyed) LOOK but becomes tappable → opens the upgrade modal instead of
          navigating. Same visual, tier-divergent behaviour (D5/D8). */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button
          onClick={historyLocked ? onHistoryUpgrade : onPrev}
          aria-label="Previous period"
          data-testid={historyLocked ? 'upgrade-history-affordance' : undefined}
          disabled={isOldest && !historyLocked}
          style={{ background: 'none', border: 'none', padding: '8px', cursor: (historyLocked || !isOldest) ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isOldest ? 'var(--c-border, #e5e7eb)' : 'var(--c-primary, #064e3b)' }}>
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

      {/* Period actions: create (always shown) + reset kebab (future periods only).
          Both gate on can('manageCycles') — disabled (greyed) for standard members;
          the server RPC rejects them too (role-denied) as belt-and-suspenders. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button onClick={onNewPeriod} data-testid="new-period-btn" aria-label="New budget period" disabled={!canManage}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flex: 1, padding: '10px', borderRadius: 12, border: `1.5px dashed ${canManage ? 'var(--c-primary, #064e3b)' : 'var(--c-border, #e5e7eb)'}`, background: 'transparent', color: canManage ? 'var(--c-primary, #064e3b)' : 'var(--c-muted, #6b7280)', fontSize: 13, fontWeight: 800, cursor: canManage ? 'pointer' : 'not-allowed', fontFamily: "'Nunito', sans-serif" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New budget period
        </button>

        {isFuture && (
          <div style={{ position: 'relative' }}>
            <button data-testid="period-actions-btn" aria-label="Period actions" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px', borderRadius: 12, border: '1.5px solid var(--c-border, #e5e7eb)', background: 'transparent', color: 'var(--c-text, #1c1917)', cursor: 'pointer' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
            </button>
            {menuOpen && (
              <>
                <div onClick={() => setMenuOpen(false)} aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 21, background: 'var(--c-card, #fff)', border: '1px solid var(--c-border, #e5e7eb)', borderRadius: 12, boxShadow: 'var(--c-shadow)', overflow: 'hidden', minWidth: 170 }}>
                  <button data-testid="reset-period-btn" disabled={!canManage} onClick={() => { setMenuOpen(false); onReset?.(); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '12px 14px', border: 'none', background: 'transparent', color: canManage ? 'var(--c-danger, #dc2626)' : 'var(--c-muted, #6b7280)', fontSize: 13, fontWeight: 800, cursor: canManage ? 'pointer' : 'not-allowed', fontFamily: "'Nunito', sans-serif", textAlign: 'left' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                    Reset budget plan
                  </button>
                </div>
              </>
            )}
          </div>
        )}
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
