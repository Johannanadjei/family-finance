/**
 * views/PaydayView.jsx — Income confirmation screen.
 * Shows past month warning. Month nav via financeValues.loadMonth.
 */

import { useState }               from 'react';
import { useNavigate }            from 'react-router-dom';
import { useBudgetCentreContext } from '../context/BudgetCentreContext';
import { useFinanceContext }      from '../context/FinanceContext';
import { AccessBlocked }         from '../components/ui/AccessBlocked';
import { getCurrentMonth, offsetMonth } from '../lib/finance';
import { formatMonth, getToday }   from '../lib/dates';
import { getCycleNav }             from '../lib/cycles';
import { Skeleton }               from '../components/ui/Skeleton';
import { PaydayHeader }           from './payday/PaydayHeader';
import { PaydayIncomeBody }       from './payday/PaydayIncomeBody';
import { PaydaySheets }           from './payday/PaydaySheets';

// Migration-created "Other Income" buckets (engineering-decisions: income-month-
// scoping) must never roll forward, nor count toward "N sources to copy".
const ONE_OFF_MARKER = '__one_off_bucket__';

function PaydayViewSkeleton() {
  const card = { background: 'var(--c-card,#fff)', borderRadius: 16, padding: '16px 18px', marginBottom: 12 };
  return (
    <div style={{ padding: '16px 16px 0' }}>
      <div style={{ ...card, marginBottom: 16 }}>
        <Skeleton width="40%" height={12} borderRadius={6} />
        <div style={{ marginTop: 10, display: 'flex', gap: 16 }}>
          <Skeleton width="45%" height={28} borderRadius={8} />
          <Skeleton width="45%" height={28} borderRadius={8} />
        </div>
      </div>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ ...card }}>
          <Skeleton width="60%" height={14} borderRadius={6} />
          <div style={{ marginTop: 10 }}><Skeleton width="40%" height={24} borderRadius={8} /></div>
          <div style={{ marginTop: 10 }}><Skeleton width="100%" height={38} borderRadius={10} /></div>
        </div>
      ))}
    </div>
  );
}

export function PaydayView() {
  const { fmt, can }                        = useBudgetCentreContext();
  const financeValues                       = useFinanceContext();
  const navigate                            = useNavigate();
  const [selectedIncome, setSelectedIncome] = useState(null);
  const [sheetOpen,      setSheetOpen]      = useState(false);
  const [mutating,       setMutating]       = useState(false);
  const [mutateError,    setMutateError]    = useState(null);
  const [copySheetOpen,  setCopySheetOpen]  = useState(false);   // 2B: multi-select rollforward sheet
  const [copying,        setCopying]        = useState(false);
  const [copyError,      setCopyError]      = useState(null);
  const [copiedCount,    setCopiedCount]    = useState(0);       // >0 → success toast
  if (!can('viewIncome')) return <AccessBlocked message="Income tracking is only available to hub owners and full-access members." />;
  // Hold first paint until cycles resolve — else the viewed-period nav/totals flash
  // a stale or empty period before the current cycle loads (cold-load flash).
  if (financeValues.cyclesLoading) return null;
  if (financeValues.loading) return <PaydayViewSkeleton />;

  const {
    incomes, allIncomes = [], error, totalReceived, totalExpected, totalPending, totalIncome, txs,
    activeMonth, cycles = [], visibleCycles = [], activeCycle, activeCycleId, loadCycle, userPlan,
    markReceived, markPending, updateExpectedAmount, copyIncomeSourcesToMonth,
  } = financeValues;

  // Viewed period: navigated cycle → auto-resolved current cycle → month fallback
  // (brand-new hub before Commit-4 auto-create). `nav` drives bounded prev/next.
  // Navigation reads visibleCycles (history gate); stale hidden activeCycleId falls
  // back to the always-visible activeCycle.
  const today          = getToday();
  const currentMonth   = getCurrentMonth();
  const viewedCycle    = visibleCycles.find(c => c.id === activeCycleId) ?? activeCycle ?? null;
  const nav            = getCycleNav(visibleCycles, viewedCycle?.id ?? null);
  const isCurrent      = viewedCycle ? (viewedCycle.start_date <= today && viewedCycle.end_date >= today) : activeMonth === currentMonth;
  const isPast         = viewedCycle ? viewedCycle.end_date   < today : activeMonth < currentMonth;
  const isFuture       = viewedCycle ? viewedCycle.start_date > today : activeMonth > currentMonth;
  const viewedMonth    = viewedCycle ? viewedCycle.start_date.slice(0, 7) : activeMonth;
  const periodLabel    = viewedCycle?.name ?? formatMonth(activeMonth);
  const pastIncomeTxs  = isPast ? txs.filter(t => t.type === 'income') : [];   // past = read-only, tx-derived
  // History gate (D6/D8): at the oldest VISIBLE cycle with older periods hidden, this
  // both (a) stops the offsetMonth fallback pulling income from a hidden period (Phase 1
  // §F leak) and (b) drives the prev-arrow upgrade affordance in <PeriodNav> via PaydayHeader.
  const historyLocked  = (userPlan || 'free') === 'free' && cycles.length > visibleCycles.length && nav.isOldest;
  // Rollforward source = the PREVIOUS CYCLE (not prev calendar month; cycles can gap).
  const prevMonth      = nav.prev ? nav.prev.start_date.slice(0, 7)
                       : historyLocked ? null
                       : offsetMonth(activeMonth, -1);
  const prevSources    = prevMonth ? allIncomes.filter(i => i.month === prevMonth && i.notes !== ONE_OFF_MARKER && !i.deleted_at) : [];
  const prevPeriodLabel = nav.prev?.name ?? (prevMonth ? formatMonth(prevMonth) : '');

  const handleOpenSheet = (income) => {
    setSelectedIncome(income);
    setMutateError(null);
    setSheetOpen(true);
  };

  const handleConfirm = async (sourceId, amount, date) => {
    setMutating(true);
    const { error: err } = await markReceived(sourceId, amount, date);
    if (err) { setMutateError('Could not confirm income. Please try again.'); }
    else     { setSheetOpen(false); setSelectedIncome(null); }
    setMutating(false);
  };

  const handleUpdateExpected = async (sourceId, newAmount, extras) => {
    const { error: err } = await updateExpectedAmount(sourceId, newAmount, extras);
    if (err) setMutateError('Could not update expected amount. Please try again.');
  };

  const handleMarkPending = async (sourceId) => {
    setMutating(true);
    const { error: err } = await markPending(sourceId);
    if (err) setMutateError('Could not update income status. Please try again.');
    setMutating(false);
  };

  // Roll income forward from the previous cycle. sourceIds undefined → copy all
  // non-bucket sources; an array → the sheet-selected subset. incomes re-derives.
  const handleCopy = async (sourceIds) => {
    setCopying(true);
    setCopyError(null);
    const { data, error: err } = await copyIncomeSourcesToMonth(prevMonth, viewedMonth, sourceIds);
    setCopying(false);
    if (err) { setCopyError("Couldn't copy. Try again."); return; }
    setCopySheetOpen(false);
    setCopiedCount(data?.length || 0);
  };

  return (
    <div style={{ padding: '16px 16px 0' }}>

      <PaydayHeader
        periodLabel={periodLabel}
        isCurrent={isCurrent}
        isFuture={isFuture}
        isLatest={nav.isLatest}
        isOldest={nav.isOldest}
        totalReceived={totalReceived}
        totalPending={totalPending}
        totalIncome={totalIncome}
        fmt={fmt}
        onPrev={() => nav.prev && loadCycle(nav.prev.id)}
        onNext={() => nav.next && loadCycle(nav.next.id)}
        historyLocked={historyLocked}
      />

      {/* Error state */}
      {(error || mutateError) && (
        <div style={{ background: 'var(--c-danger-bg, #fef2f2)', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-danger, #dc2626)', margin: 0 }}>
            {mutateError || error}
          </p>
        </div>
      )}

      {/* Income list — current month editable, past months read-only, future months empty */}
      <PaydayIncomeBody
        isFuture={isFuture}
        isPast={isPast}
        periodLabel={periodLabel}
        prevPeriodLabel={prevPeriodLabel}
        pastIncomeTxs={pastIncomeTxs}
        incomes={incomes}
        fmt={fmt}
        mutating={mutating}
        prevSourceCount={prevSources.length}
        copying={copying}
        copyError={copyError}
        onCopyAll={() => handleCopy(undefined)}
        onChooseWhich={() => { setCopyError(null); setCopySheetOpen(true); }}
        onAddManually={() => navigate('/settings')}
        onConfirm={handleOpenSheet}
        onMarkPending={handleMarkPending}
        onUpdateExpected={handleUpdateExpected}
      />

      <PaydaySheets
        income={selectedIncome}
        confirmOpen={sheetOpen}
        onCloseConfirm={() => { setSheetOpen(false); setMutateError(null); }}
        onConfirm={handleConfirm}
        mutating={mutating}
        mutateError={mutateError}
        copyOpen={copySheetOpen}
        onCloseCopy={() => setCopySheetOpen(false)}
        prevPeriodLabel={prevPeriodLabel}
        prevSources={prevSources}
        onCopy={handleCopy}
        copying={copying}
        copiedCount={copiedCount}
        periodLabel={periodLabel}
        onDismissToast={() => setCopiedCount(0)}
      />
    </div>
  );
}
