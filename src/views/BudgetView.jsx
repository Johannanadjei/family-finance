/**
 * views/BudgetView.jsx
 *
 * Budget breakdown — planned vs actual spend per category, for the VIEWED cycle.
 * Categories sorted by % used descending — most urgent first.
 *
 * Cycle-migrated (Commit 8): gained period nav (none before); plan AND spend derive
 * from the viewed cycle (local allCategories filter + recompute), not the clock;
 * past-period mutations gated via usePastPeriodGuard; Commit-0 band-aid removed.
 */

import { useState, useEffect, useMemo } from 'react';
import { useBudgetCentreContext } from '../context/BudgetCentreContext';
import { useFinanceContext }      from '../context/FinanceContext';
import { usePastPeriodGuard }     from '../hooks/usePastPeriodGuard';
import { getCurrentMonth, offsetMonth, calcTotalFixed, calcCategorySpend, calcFixedSpent } from '../lib/finance';
import { formatMonth, getToday }  from '../lib/dates';
import { getCycleNav }            from '../lib/cycles';
import { Skeleton }               from '../components/ui/Skeleton';
import { Toast }                   from '../components/ui/Toast';
import { CategoryBudgetRow }      from './budget/CategoryBudgetRow';
import { AddCategorySheet }       from './budget/AddCategorySheet';
import { BudgetEmptyState }       from './budget/BudgetEmptyState';
import { CopyCategoriesSheet }    from './budget/CopyCategoriesSheet';
import { BudgetHeader }           from './budget/BudgetHeader';

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
  const { allCategories = [], fmt, addCategory, prevMonthCategories, loadPrevMonthCategories, copyCategoriesToMonth } = useBudgetCentreContext();
  const { txs, loading, error, activeMonth, cycles = [], activeCycle, activeCycleId, loadCycle } = useFinanceContext();
  const [sheetOpen,     setSheetOpen]     = useState(false);
  const [copySheetOpen, setCopySheetOpen] = useState(false);   // 2C: multi-select rollforward sheet
  const [copying,       setCopying]       = useState(false);
  const [copyError,     setCopyError]     = useState(null);
  const [copiedCount,   setCopiedCount]   = useState(0);       // >0 → success toast

  // Viewed period: navigated cycle → auto-resolved current cycle → month fallback.
  const today        = getToday();
  const viewedCycle  = cycles.find(c => c.id === activeCycleId) ?? activeCycle ?? null;
  const nav          = getCycleNav(cycles, viewedCycle?.id ?? null);
  const viewedMonth  = viewedCycle ? viewedCycle.start_date.slice(0, 7) : activeMonth;
  const isPast       = viewedCycle ? viewedCycle.end_date < today : viewedMonth < getCurrentMonth();
  const periodLabel  = viewedCycle?.name ?? formatMonth(activeMonth);

  // Plan + spend derive from the VIEWED cycle. Local filter of allCategories by
  // cycle_id (Commit 11.5 — month is dropped in Commit 13); spend recomputed from txs.
  // useFinance's slices track activeCycle (current), which differs from viewedCycle when
  // navigating past periods — so BudgetView keeps its own viewedCycle-scoped slice.
  const viewedCategories = useMemo(
    () => allCategories.filter(c => c.cycle_id === viewedCycle?.id && !c.deleted_at),
    [allCategories, viewedCycle?.id]
  );
  const fixedTotal    = useMemo(() => calcTotalFixed(viewedCategories),         [viewedCategories]);
  const categorySpend = useMemo(() => calcCategorySpend(txs, viewedCategories), [txs, viewedCategories]);
  const fixedSpent    = useMemo(() => calcFixedSpent(txs, viewedCategories),    [txs, viewedCategories]);

  // Rollforward source = the previous CYCLE (nav.prev), target = the viewed month.
  const prevMonth       = nav.prev ? nav.prev.start_date.slice(0, 7) : offsetMonth(viewedMonth, -1);
  const prevPeriodLabel = nav.prev?.name ?? formatMonth(prevMonth);
  const isEmpty         = viewedCategories.length === 0;
  useEffect(() => {
    if (isEmpty) loadPrevMonthCategories(prevMonth);
  }, [isEmpty, prevMonth, loadPrevMonthCategories]);

  // Past-period mutation guard — the hook owns the confirm modal and routes add/copy.
  const { requestMutation, guardModal } = usePastPeriodGuard({ isPast, periodLabel });

  const handleCopy = async (categoryIds) => {
    setCopying(true);
    setCopyError(null);
    // viewedCycle.id stamps the optimistic rows; the mutation refuses a NULL-cycle insert (CYC02).
    const { data, error: err } = await copyCategoriesToMonth(prevMonth, viewedMonth, categoryIds, viewedCycle?.id);
    setCopying(false);
    if (err) { setCopyError("Couldn't copy. Try again."); return; }
    setCopySheetOpen(false);
    setCopiedCount(data?.length || 0);
  };

  if (loading) return <BudgetViewSkeleton />;

  const rows = viewedCategories
    .map(cat => {
      const spent     = categorySpend[cat.name] || 0;
      const remaining = cat.budget_amount - spent;
      const pctUsed   = cat.budget_amount > 0 ? Math.min(100, Math.round((spent / cat.budget_amount) * 100)) : 0;
      return { ...cat, spent, remaining, pctUsed, overBudget: spent > cat.budget_amount };
    })
    .sort((a, b) => b.pctUsed - a.pctUsed);

  return (
    <div style={{ padding: '16px' }}>

      <BudgetHeader
        periodLabel={periodLabel}
        fmt={fmt}
        fixedTotal={fixedTotal}
        fixedSpent={fixedSpent}
        isLatest={nav.isLatest}
        isOldest={nav.isOldest}
        onPrev={() => nav.prev && loadCycle(nav.prev.id)}
        onNext={() => nav.next && loadCycle(nav.next.id)}
      />

      {/* Error state */}
      {error && (
        <div style={{ background: 'var(--c-danger-bg, #fef2f2)', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-danger, #dc2626)', margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Category list — empty viewed cycle offers a rollforward from the previous cycle */}
      {viewedCategories.length === 0 ? (
        <BudgetEmptyState
          monthLabel={periodLabel}
          lastMonthLabel={prevPeriodLabel}
          prevCategoryCount={prevMonthCategories.length}
          onCopyAll={() => requestMutation(() => handleCopy(undefined))}
          onChooseWhich={() => { setCopyError(null); requestMutation(() => setCopySheetOpen(true)); }}
          onAddManually={() => requestMutation(() => setSheetOpen(true))}
          copying={copying}
          copyError={copyError}
        />
      ) : (
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
      )}

      {/* Add category button — hidden when empty (BudgetEmptyState owns the add CTA) */}
      {viewedCategories.length > 0 && (
        <button
          onClick={() => requestMutation(() => setSheetOpen(true))}
          style={{ width: '100%', padding: '14px', borderRadius: 12, border: '2px dashed var(--c-primary, #064e3b)', background: 'transparent', color: 'var(--c-primary, #064e3b)', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif", marginTop: 24, marginBottom: 16 }}
        >
          + Add budget category
        </button>
      )}

      <AddCategorySheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onAdd={addCategory}
        targetMonth={viewedMonth}
      />

      <CopyCategoriesSheet
        isOpen={copySheetOpen}
        onClose={() => setCopySheetOpen(false)}
        lastMonthLabel={prevPeriodLabel}
        categories={prevMonthCategories}
        fmt={fmt}
        onCopy={handleCopy}
        copying={copying}
      />

      {guardModal}

      {copiedCount > 0 && (
        <Toast
          message={`Copied ${copiedCount} budget ${copiedCount === 1 ? 'category' : 'categories'} to ${periodLabel}`}
          actionLabel="Done"
          onEdit={() => setCopiedCount(0)}
          onDismiss={() => setCopiedCount(0)}
        />
      )}
    </div>
  );
}
