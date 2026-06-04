/**
 * views/budget/BudgetCategoryList.jsx
 *
 * The Budget view's category body: the planned-vs-spent rows (sorted by % used, most
 * urgent first), the empty-period rollforward state, and the "+ Add budget category"
 * button. Extracted from BudgetView to keep that orchestrator under the 200-line audit
 * cap once the period-reset wiring landed (same precedent as BudgetSheets /
 * BudgetPeriodCreator).
 *
 * Pure display: it derives the per-row spend/remaining/pct from `categorySpend` but
 * performs no mutations — every action arrives as an already-guarded callback prop
 * (the parent's usePastPeriodGuard wraps them). `fmt` is threaded in (the parent owns it).
 *
 * @param {object[]} categories        — the viewed cycle's categories (already sliced)
 * @param {object}   categorySpend     — { [categoryName]: spent } for the viewed cycle
 * @param {function} fmt
 * @param {string}   periodLabel       — viewed period label (empty-state heading)
 * @param {string}   prevPeriodLabel   — previous period label (rollforward source)
 * @param {number}   prevCategoryCount — # categories in the previous period
 * @param {boolean}  copying           — a rollforward copy is in flight
 * @param {string|null} copyError
 * @param {function} onCopyAll         — copy all previous categories (guarded)
 * @param {function} onChooseWhich     — open the multi-select copy sheet (guarded)
 * @param {function} onAddManually     — open the add sheet from the empty state (guarded)
 * @param {function} onAddCategory     — open the add sheet from the list footer (guarded)
 */

import { CategoryBudgetRow } from './CategoryBudgetRow';
import { BudgetEmptyState }  from './BudgetEmptyState';

export function BudgetCategoryList({
  categories, categorySpend, fmt, periodLabel, prevPeriodLabel, prevCategoryCount,
  copying, copyError, onCopyAll, onChooseWhich, onAddManually, onAddCategory,
}) {
  if (categories.length === 0) {
    return (
      <BudgetEmptyState
        monthLabel={periodLabel}
        lastMonthLabel={prevPeriodLabel}
        prevCategoryCount={prevCategoryCount}
        onCopyAll={onCopyAll}
        onChooseWhich={onChooseWhich}
        onAddManually={onAddManually}
        copying={copying}
        copyError={copyError}
      />
    );
  }

  const rows = categories
    .map(cat => {
      const spent     = categorySpend[cat.name] || 0;
      const remaining = cat.budget_amount - spent;
      const pctUsed   = cat.budget_amount > 0 ? Math.min(100, Math.round((spent / cat.budget_amount) * 100)) : 0;
      return { ...cat, spent, remaining, pctUsed, overBudget: spent > cat.budget_amount };
    })
    .sort((a, b) => b.pctUsed - a.pctUsed);

  return (
    <>
      <div style={{ background: 'var(--c-card, #fff)', borderRadius: 16, padding: '0 16px', boxShadow: 'var(--c-shadow)' }}>
        {rows.map(row => (
          <CategoryBudgetRow
            key={row.id}
            category={row}
            spent={row.spent}
            remaining={row.remaining}
            pctUsed={row.pctUsed}
            overBudget={row.overBudget}
            fmt={fmt}
          />
        ))}
      </div>

      <button
        onClick={onAddCategory}
        style={{ width: '100%', padding: '14px', borderRadius: 12, border: '2px dashed var(--c-primary, #064e3b)', background: 'transparent', color: 'var(--c-primary, #064e3b)', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif", marginTop: 24, marginBottom: 16 }}
      >
        + Add budget category
      </button>
    </>
  );
}
