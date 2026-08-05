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
 * @param {number}   count             — number of categories in the viewed cycle
 * @param {number}   limit             — tier category cap (10 free / Infinity pro)
 * @param {string|null} plan           — the HUB's tier: 'free' | 'pro' | null (unresolved)
 * @param {boolean}  atCap             — free HUB at the per-cycle category limit
 * @param {boolean}  isOwner           — viewer owns this hub; only they get the pay CTA
 * @param {function} onUpgrade         — open the CAT01 upgrade modal (shown at cap)
 */

import { CategoryBudgetRow } from './CategoryBudgetRow';
import { BudgetEmptyState }  from './BudgetEmptyState';
import { CAP_REACHED_LABEL } from '../../lib/planCopy';

export function BudgetCategoryList({
  categories, categorySpend, fmt, periodLabel, prevPeriodLabel, prevCategoryCount,
  copying, copyError, onCopyAll, onChooseWhich, onAddManually, onAddCategory,
  count = 0, limit, plan = null, atCap = false, isOwner = true, onUpgrade,
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', margin: '0 2px 8px' }}>
        <span data-testid="category-count" style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-muted, #6b7280)' }}>
          {plan === 'free' ? `${count} of ${limit}` : `${count} categories`}
        </span>
      </div>

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

      {/* At cap the button renders for EVERY role — a non-owner hits the same shared
          limit and must see it — but only the owner's opens a purchase path. Theirs
          reads "Upgrade to Pro"; a non-owner's states the limit and the modal offers
          ASK_OWNER_LINE instead of the pay CTA. */}
      {atCap ? (
        <button
          data-testid="upgrade-categories-btn"
          onClick={onUpgrade}
          style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: 'var(--c-primary, #064e3b)', color: 'var(--c-btn-text, #ffffff)', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif", marginTop: 24, marginBottom: 16 }}
        >
          {isOwner ? 'Upgrade to Pro' : CAP_REACHED_LABEL}
        </button>
      ) : (
        <button
          onClick={onAddCategory}
          style={{ width: '100%', padding: '14px', borderRadius: 12, border: '2px dashed var(--c-primary, #064e3b)', background: 'transparent', color: 'var(--c-primary, #064e3b)', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif", marginTop: 24, marginBottom: 16 }}
        >
          + Add budget category
        </button>
      )}
    </>
  );
}
