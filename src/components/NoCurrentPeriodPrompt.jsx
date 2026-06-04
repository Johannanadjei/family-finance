/**
 * components/NoCurrentPeriodPrompt.jsx — passive "today has no budget period" banner (Phase B).
 *
 * After the anchor pivot removed auto-create (Phase A), a hub can sit with NO budget
 * period covering today — every existing period has ended, or none exists yet. Without
 * a signal the dashboards silently show a stale past period's name as if it were "now".
 * This banner is that signal.
 *
 * Visibility rule (single source of truth — Decision Q2, persistent / not dismissable):
 * render ONLY when no live cycle contains today. If a current period exists, render
 * null. Centralising the getCycleContainingDate check here means Home and Budget mount
 * it with one line each and never duplicate the rule.
 *
 * @param {object[]} cycles    — live cycle list (from FinanceContext)
 * @param {function} onCreate  — open the period creator (Budget) or route to it (Home)
 */

import { getCycleContainingDate } from '../lib/cycles';
import { getToday }               from '../lib/dates';

export function NoCurrentPeriodPrompt({ cycles = [], onCreate }) {
  if (getCycleContainingDate(cycles, getToday())) return null;

  return (
    <div data-testid="no-current-period-prompt" style={{
      background: 'var(--c-card, #fff)', border: '1.5px solid var(--c-warning, #d97706)',
      borderRadius: 16, padding: '16px 18px', marginBottom: 16, boxShadow: 'var(--c-shadow)',
    }}>
      <p style={{ fontSize: 15, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: '0 0 4px' }}>
        No budget period for today
      </p>
      <p style={{ fontSize: 13, color: 'var(--c-muted, #6b7280)', margin: '0 0 14px', lineHeight: 1.5 }}>
        Create one to start tracking this period's spending.
      </p>
      <button data-testid="create-period-cta" onClick={onCreate} style={{
        width: '100%', padding: '12px', borderRadius: 12, border: 'none',
        background: 'var(--c-primary, #064e3b)', color: 'var(--c-btn-text, #fff)',
        fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif",
      }}>
        Create budget period
      </button>
    </div>
  );
}
