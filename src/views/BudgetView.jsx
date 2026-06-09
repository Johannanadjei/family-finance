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
import { getLimitsForTier }       from '../lib/plans';
import { CATEGORY_CAP_BODY } from '../lib/planCopy';
import { Skeleton }               from '../components/ui/Skeleton';
import { UpgradeModal }           from '../components/ui/UpgradeModal';
import { BudgetCategoryList }     from './budget/BudgetCategoryList';
import { BudgetHeader }           from './budget/BudgetHeader';
import { BudgetPeriodCreator }    from './budget/BudgetPeriodCreator';
import { BudgetSheets }           from './budget/BudgetSheets';

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
  const { allCategories = [], fmt, can, addCategory, prevMonthCategories, loadPrevMonthCategories, copyCategoriesToMonth } = useBudgetCentreContext();
  const { txs, loading, cyclesLoading, error, activeMonth, cycles = [], visibleCycles = [], activeCycle, activeCycleId, loadCycle, userPlan } = useFinanceContext();
  const [sheetOpen,        setSheetOpen]        = useState(false);
  const [periodOpen,       setPeriodOpen]       = useState(false);   // Phase B: budget-period creator
  const [copySheetOpen,    setCopySheetOpen]    = useState(false);   // 2C: multi-select rollforward sheet
  const [copying,          setCopying]          = useState(false);
  const [copyError,        setCopyError]         = useState(null);
  const [copiedCount,      setCopiedCount]      = useState(0);       // >0 → success toast
  const [resetCycle,       setResetCycle]       = useState(null);    // reset-period target (future only)
  const [showUpgrade,      setShowUpgrade]      = useState(false);   // category-cap upgrade modal (CAT01)

  // Viewed period: navigated cycle → current → month fallback. Nav reads visibleCycles
  // (history gate); a now-hidden activeCycleId (Pro→Free downgrade) falls back to activeCycle.
  const today        = getToday();
  const viewedCycle  = visibleCycles.find(c => c.id === activeCycleId) ?? activeCycle ?? null;
  const nav          = getCycleNav(visibleCycles, viewedCycle?.id ?? null);
  const viewedMonth  = viewedCycle ? viewedCycle.start_date.slice(0, 7) : activeMonth;
  const isPast       = viewedCycle ? viewedCycle.end_date < today : viewedMonth < getCurrentMonth();
  const isFuture     = viewedCycle ? viewedCycle.start_date > today : false;   // reset is future-only
  const periodLabel  = viewedCycle?.name ?? formatMonth(activeMonth);

  // Plan + spend derive from the VIEWED cycle (its own cycle_id slice of allCategories);
  // useFinance's slices track the current cycle, which differs when navigating past periods.
  const viewedCategories = useMemo(
    () => allCategories.filter(c => c.cycle_id === viewedCycle?.id && !c.deleted_at),
    [allCategories, viewedCycle?.id]
  );
  const fixedTotal    = useMemo(() => calcTotalFixed(viewedCategories),         [viewedCategories]);
  const categorySpend = useMemo(() => calcCategorySpend(txs, viewedCategories), [txs, viewedCategories]);
  const fixedSpent    = useMemo(() => calcFixedSpent(txs, viewedCategories),    [txs, viewedCategories]);

  // Category cap (CAT01) — UX gate only (owner-tier enforced server-side). Free → "N of 10".
  const plan      = userPlan || 'free';
  const catLimit  = getLimitsForTier(plan).maxCategoriesPerHub;
  const atCatCap  = plan === 'free' && viewedCategories.length >= catLimit;

  // History gate (D6) — at-wall upgrade affordance shows only for a FREE user with older
  // cycles hidden AND on the oldest VISIBLE cycle. Pro / ≤3-cycle hubs → normal disabled.
  const historyLocked = plan === 'free' && cycles.length > visibleCycles.length && nav.isOldest;

  // Rollforward source = previous CYCLE. historyLocked → null so the offsetMonth fallback
  // can't reach a HIDDEN period (Phase 1 §F leak); nav.prev is always a visible cycle.
  const prevMonth       = nav.prev ? nav.prev.start_date.slice(0, 7)
                        : historyLocked ? null
                        : offsetMonth(viewedMonth, -1);
  const prevPeriodLabel = nav.prev?.name ?? (prevMonth ? formatMonth(prevMonth) : '');
  const isEmpty         = viewedCategories.length === 0;
  useEffect(() => {
    if (isEmpty && prevMonth) loadPrevMonthCategories(prevMonth);
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

  // Hold first paint until cycles resolve — else BudgetPeriodCreator's
  // NoCurrentPeriodPrompt + empty categories flash before the period loads.
  if (cyclesLoading) return null;
  if (loading) return <BudgetViewSkeleton />;

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
        onNewPeriod={() => setPeriodOpen(true)}
        canManage={can('manageCycles')}
        isFuture={isFuture}
        onReset={() => setResetCycle(viewedCycle)}
        historyLocked={historyLocked}
      />

      <BudgetPeriodCreator
        isOpen={periodOpen}
        onOpenChange={setPeriodOpen}
        onCopyRequested={() => { setCopyError(null); setCopySheetOpen(true); }}
        resetCycle={resetCycle}
        onResetDone={() => setResetCycle(null)}
      />

      {/* Error state */}
      {error && (
        <div style={{ background: 'var(--c-danger-bg, #fef2f2)', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-danger, #dc2626)', margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Category body — rows (sorted) + add button, or the empty rollforward state.
          Extracted to BudgetCategoryList; actions are guarded via requestMutation here. */}
      <BudgetCategoryList
        categories={viewedCategories}
        categorySpend={categorySpend}
        fmt={fmt}
        periodLabel={periodLabel}
        prevPeriodLabel={prevPeriodLabel}
        prevCategoryCount={prevMonthCategories.length}
        copying={copying}
        copyError={copyError}
        onCopyAll={() => requestMutation(() => handleCopy(undefined))}
        onChooseWhich={() => { setCopyError(null); requestMutation(() => setCopySheetOpen(true)); }}
        onAddManually={() => requestMutation(() => setSheetOpen(true))}
        onAddCategory={() => requestMutation(() => setSheetOpen(true))}
        count={viewedCategories.length}
        limit={catLimit}
        plan={plan}
        atCap={atCatCap}
        onUpgrade={() => setShowUpgrade(true)}
      />

      <BudgetSheets
        addOpen={sheetOpen}
        onCloseAdd={() => setSheetOpen(false)}
        onAdd={(cat) => addCategory(cat, viewedCycle?.id)}
        targetMonth={viewedMonth}
        copyOpen={copySheetOpen}
        onCloseCopy={() => setCopySheetOpen(false)}
        prevPeriodLabel={prevPeriodLabel}
        prevCategories={prevMonthCategories}
        onCopy={handleCopy}
        copying={copying}
        copiedCount={copiedCount}
        periodLabel={periodLabel}
        onDismissToast={() => setCopiedCount(0)}
      />

      {guardModal}

      <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} body={CATEGORY_CAP_BODY} />
    </div>
  );
}
