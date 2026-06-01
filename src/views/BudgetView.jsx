/**
 * views/BudgetView.jsx
 *
 * Budget breakdown — planned vs actual spend per category.
 * Categories sorted by % used descending — most urgent first.
 * All data from FinanceContext and BudgetCentreContext — no new services.
 */

import { useState, useEffect }    from 'react';
import { useBudgetCentreContext } from '../context/BudgetCentreContext';
import { useFinanceContext }      from '../context/FinanceContext';
import { getCurrentMonth, offsetMonth } from '../lib/finance';
import { formatMonth }            from '../lib/dates';
import { Skeleton }               from '../components/ui/Skeleton';
import { Toast }                   from '../components/ui/Toast';
import { CategoryBudgetRow }      from './budget/CategoryBudgetRow';
import { AddCategorySheet }       from './budget/AddCategorySheet';
import { BudgetEmptyState }       from './budget/BudgetEmptyState';
import { CopyCategoriesSheet }    from './budget/CopyCategoriesSheet';

function BudgetViewSkeleton() {
  return (
    <div style={{ padding: '16px' }}>
      <div style={{ background: 'var(--c-card,#fff)', borderRadius: 16, padding: '16px 18px', marginBottom: 16 }}>
        <Skeleton width="40%" height={12} borderRadius={6} />
        <div style={{ marginTop: 10, display: 'flex', gap: 16 }}>
          <Skeleton width="45%" height={28} borderRadius={8} />
          <Skeleton width="45%" height={28} borderRadius={8} />
        </div>
      </div>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{ background: 'var(--c-card,#fff)', borderRadius: 12, padding: '14px 16px', marginBottom: 10 }}>
          <Skeleton width="60%" height={12} borderRadius={6} />
          <div style={{ marginTop: 10 }}><Skeleton width="100%" height={6} borderRadius={3} /></div>
          <div style={{ marginTop: 6 }}><Skeleton width="40%" height={10} borderRadius={5} /></div>
        </div>
      ))}
    </div>
  );
}

export function BudgetView() {
  const { categories, fmt, addCategory, prevMonthCategories, loadPrevMonthCategories, copyCategoriesToMonth } = useBudgetCentreContext();
  const { categorySpend, fixedTotal, fixedSpent, loading, error, activeMonth, loadMonth } = useFinanceContext();
  const [sheetOpen,     setSheetOpen]     = useState(false);
  const [copySheetOpen, setCopySheetOpen] = useState(false);   // 2C: multi-select rollforward sheet
  const [copying,       setCopying]       = useState(false);
  const [copyError,     setCopyError]     = useState(null);
  const [copiedCount,   setCopiedCount]   = useState(0);       // >0 → success toast

  // Commit 0 band-aid: BudgetView reads clock-based categories but finance figures
  // (categorySpend/fixedSpent) follow the shared, mutable activeMonth. If another
  // view (Payday/Daily/Log) navigated to a past month, Budget would show that month's
  // spend under a current-month label. Reset activeMonth to the clock on mount so the
  // two agree. Mount-only — empty deps intentional. Throwaway: removed when Budget
  // Cycles unifies the active-period source of truth (Commits 5–9).
  useEffect(() => {
    if (activeMonth !== getCurrentMonth()) loadMonth(getCurrentMonth());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // BudgetView is current-month-only (no month nav), so the rollforward source is
  // always last month. When the current budget is empty, load it to decide State
  // 1 vs 2/3 of the prompt. Setting prevMonthCategories doesn't change
  // categories.length, so this can't loop.
  const currentMonth = getCurrentMonth();
  const prevMonth    = offsetMonth(currentMonth, -1);
  const isEmpty      = categories.length === 0;
  useEffect(() => {
    if (isEmpty) loadPrevMonthCategories(prevMonth);
  }, [isEmpty, prevMonth, loadPrevMonthCategories]);

  // Roll the previous month's budget forward. `categoryIds` undefined → copy all;
  // an array → only the sheet-selected subset. The current-month `categories`
  // list re-derives automatically as the optimistic rows land.
  const handleCopy = async (categoryIds) => {
    setCopying(true);
    setCopyError(null);
    const { data, error: err } = await copyCategoriesToMonth(prevMonth, currentMonth, categoryIds);
    setCopying(false);
    if (err) { setCopyError("Couldn't copy. Try again."); return; }
    setCopySheetOpen(false);
    setCopiedCount(data?.length || 0);
  };

  if (loading) return <BudgetViewSkeleton />;

  const rows = categories
    .map(cat => {
      const spent     = categorySpend[cat.name] || 0;
      const remaining = cat.budget_amount - spent;
      const pctUsed   = cat.budget_amount > 0
        ? Math.min(100, Math.round((spent / cat.budget_amount) * 100))
        : 0;
      return { ...cat, spent, remaining, pctUsed, overBudget: spent > cat.budget_amount };
    })
    .sort((a, b) => b.pctUsed - a.pctUsed);

  return (
    <div style={{ padding: '16px' }}>

      {/* Month label — static, mirrors PaydayHeader (no nav; BudgetView is current-month-only) */}
      <div style={{ marginBottom: 16, textAlign: 'center' }}>
        <p data-testid="budget-month-label" style={{ fontSize: 16, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: 0 }}>
          {formatMonth(currentMonth)}
        </p>
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

      {/* Error state */}
      {error && (
        <div style={{ background: 'var(--c-danger-bg, #fef2f2)', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-danger, #dc2626)', margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Category list — empty current month offers a rollforward from last month */}
      {categories.length === 0 ? (
        <BudgetEmptyState
          monthLabel={formatMonth(currentMonth)}
          lastMonthLabel={formatMonth(prevMonth)}
          prevCategoryCount={prevMonthCategories.length}
          onCopyAll={() => handleCopy(undefined)}
          onChooseWhich={() => { setCopyError(null); setCopySheetOpen(true); }}
          onAddManually={() => setSheetOpen(true)}
          copying={copying}
          copyError={copyError}
        />
      ) : (
        <div style={{ background: 'var(--c-card, #fff)', borderRadius: 16, padding: '0 16px', boxShadow: 'var(--c-shadow)' }}>
          {rows.map((row, idx) => (
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
      )}
      {/* Add category button — hidden when empty (BudgetEmptyState owns the add CTA) */}
      {categories.length > 0 && (
        <button
          onClick={() => setSheetOpen(true)}
          style={{ width: '100%', padding: '14px', borderRadius: 12, border: '2px dashed var(--c-primary, #064e3b)', background: 'transparent', color: 'var(--c-primary, #064e3b)', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif", marginTop: 24, marginBottom: 16 }}
        >
          + Add budget category
        </button>
      )}

      <AddCategorySheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onAdd={addCategory}
      />

      <CopyCategoriesSheet
        isOpen={copySheetOpen}
        onClose={() => setCopySheetOpen(false)}
        lastMonthLabel={formatMonth(prevMonth)}
        categories={prevMonthCategories}
        fmt={fmt}
        onCopy={handleCopy}
        copying={copying}
      />

      {copiedCount > 0 && (
        <Toast
          message={`Copied ${copiedCount} budget ${copiedCount === 1 ? 'category' : 'categories'} to ${formatMonth(currentMonth)}`}
          actionLabel="Done"
          onEdit={() => setCopiedCount(0)}
          onDismiss={() => setCopiedCount(0)}
        />
      )}
    </div>
  );
}
