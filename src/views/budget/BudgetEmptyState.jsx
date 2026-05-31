/**
 * views/budget/BudgetEmptyState.jsx — current-month empty budget state (Phase 2C).
 *
 * The budget-categories analog of payday's NoIncomeSourcesEmpty. Renders one of
 * three states based on how many categories the PREVIOUS month had:
 *
 *  State 1 — prevCategoryCount === 0 (or month-1 user):
 *    "No budget set for <month> yet" + "+ Add manually" only.
 *  State 2/3 — prevCategoryCount >= 1:
 *    "Budget same as <lastMonth>?" with a three-tier CTA stack —
 *      • primary   "Yes, copy N categor(y|ies)"  → onCopyAll
 *      • secondary "Choose which to copy"         → onChooseWhich
 *      • tertiary  "+ Add manually"               → onAddManually
 *
 * Pure display: receives the count + labels + callbacks as props; never queries.
 *
 * @param {string}   monthLabel        — e.g. "June 2026"
 * @param {string}   lastMonthLabel    — e.g. "May 2026"
 * @param {number}   prevCategoryCount — non-deleted categories in the previous month
 * @param {function} onCopyAll         — copy every previous-month category (also retry)
 * @param {function} onChooseWhich     — open the multi-select CopyCategoriesSheet
 * @param {function} onAddManually     — open the add-category flow
 * @param {boolean}  [copying]         — a copy is in flight (disables the CTAs)
 * @param {string|null} [copyError]    — inline error from a failed copy
 */

const pluralCategories = (n) => `${n} ${n === 1 ? 'category' : 'categories'}`;

const primaryBtn = {
  padding: '12px 24px', borderRadius: 12, border: 'none',
  background: 'var(--c-primary, #064e3b)', color: 'var(--c-btn-text, #ffffff)',
  fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif",
};
const secondaryBtn = {
  padding: '12px 24px', borderRadius: 12, border: '1.5px solid var(--c-border, #e5e7eb)',
  background: 'var(--c-card, #ffffff)', color: 'var(--c-text, #1c1917)',
  fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif",
};
const tertiaryBtn = {
  padding: '10px 24px', borderRadius: 12, border: 'none', background: 'none',
  color: 'var(--c-muted, #6b7280)', fontSize: 15, fontWeight: 800, cursor: 'pointer',
  fontFamily: "'Nunito', sans-serif",
};

export function BudgetEmptyState({ monthLabel, lastMonthLabel, prevCategoryCount = 0, onCopyAll, onChooseWhich, onAddManually, copying = false, copyError = null }) {
  const canRollForward = prevCategoryCount > 0;

  return (
    <div style={{ textAlign: 'center', padding: '48px 16px' }}>
      <p style={{ fontSize: 36, margin: '0 0 12px' }}>📋</p>
      <p style={{ fontSize: 16, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: '0 0 6px' }}>
        {canRollForward ? `Budget same as ${lastMonthLabel}?` : `No budget set for ${monthLabel} yet`}
      </p>
      <p style={{ fontSize: 15, color: 'var(--c-muted, #6b7280)', margin: '0 0 20px', lineHeight: 1.5 }}>
        {canRollForward
          ? `Carry your categories over from ${lastMonthLabel}, or start fresh.`
          : 'Add budget categories to start tracking your spending.'}
      </p>

      {copyError && (
        <div style={{ background: 'var(--c-danger-bg, #fef2f2)', borderRadius: 10, padding: '10px 14px', maxWidth: 280, margin: '0 auto 12px' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-danger, #dc2626)', margin: 0 }}>{copyError}</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 280, margin: '0 auto' }}>
        {canRollForward && (
          <>
            <button data-testid="copy-all-categories-btn" onClick={onCopyAll} disabled={copying}
              style={{ ...primaryBtn, cursor: copying ? 'not-allowed' : 'pointer', opacity: copying ? 0.6 : 1 }}>
              {copying ? 'Copying…' : `Yes, copy ${pluralCategories(prevCategoryCount)}`}
            </button>
            <button data-testid="choose-which-categories-btn" onClick={onChooseWhich} disabled={copying} style={secondaryBtn}>
              Choose which to copy
            </button>
          </>
        )}
        <button data-testid="add-category-manually-btn" onClick={onAddManually} disabled={copying}
          style={canRollForward ? tertiaryBtn : primaryBtn}>
          + Add manually
        </button>
      </div>
    </div>
  );
}
