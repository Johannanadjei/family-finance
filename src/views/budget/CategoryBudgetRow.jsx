/**
 * views/budget/CategoryBudgetRow.jsx
 *
 * Single budget category row for BudgetView.
 * Shows icon, name, spent vs budget, progress bar, remaining or over-budget label.
 * All styling driven by pctUsed — no hardcoded colours outside CSS vars.
 *
 * @param {{ id, name, icon, budget_amount }} category
 * @param {number}   spent       — actual spend this month
 * @param {number}   remaining   — budget_amount - spent
 * @param {number}   pctUsed     — 0-100
 * @param {boolean}  overBudget
 * @param {function} fmt
 */

import { getBudgetStatusFromBudget } from '../../lib/finance';

export function CategoryBudgetRow({ category, spent, remaining, pctUsed, overBudget, fmt }) {
  // Shared canonical thresholds (amber > 70, red > 90) — single source of truth
  // in lib/finance, also used by the Home Budget Health bar.
  const barColor = getBudgetStatusFromBudget(pctUsed).color;

  return (
    <div style={{ padding: '14px 0', borderBottom: '1px solid var(--c-border, #e5e7eb)' }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>{category.icon}</span>
          <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--c-text, #1c1917)', margin: 0 }}>
            {category.name}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 12, color: 'var(--c-muted, #6b7280)', margin: 0 }}>
            <span data-testid={`budget-spent-${category.id}`} style={{ fontWeight: 800, color: overBudget ? 'var(--c-danger, #dc2626)' : 'var(--c-text, #1c1917)' }}>
              {fmt(spent)}
            </span>
            {' / '}{fmt(category.budget_amount)}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ background: 'var(--c-border, #e5e7eb)', borderRadius: 4, height: 6, overflow: 'hidden', marginBottom: 6 }}>
        <div
          data-testid={`budget-bar-${category.id}`}
          style={{
            width:        `${pctUsed}%`,
            height:       '100%',
            background:   barColor,
            borderRadius: 4,
            transition:   'width .3s ease',
          }}
        />
      </div>

      {/* Remaining / over budget */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {overBudget ? (
          <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--c-danger, #dc2626)', margin: 0 }}>
            Over budget by <span data-testid={`budget-remaining-${category.id}`}>{fmt(Math.abs(remaining))}</span>
          </p>
        ) : (
          <p style={{ fontSize: 11, color: 'var(--c-muted, #6b7280)', margin: 0 }}>
            <span data-testid={`budget-remaining-${category.id}`}>{fmt(remaining)}</span> remaining
          </p>
        )}
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-muted, #6b7280)', margin: 0 }}>
          {pctUsed}%
        </p>
      </div>
    </div>
  );
}
