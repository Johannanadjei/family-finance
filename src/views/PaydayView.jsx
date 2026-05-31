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
import { Skeleton }               from '../components/ui/Skeleton';
import { Toast }                   from '../components/ui/Toast';
import { ConfirmSheet }           from './payday/ConfirmSheet';
import { CopyIncomeSheet }        from './payday/CopyIncomeSheet';
import { PaydayHeader }           from './payday/PaydayHeader';
import { PaydayIncomeBody }       from './payday/PaydayIncomeBody';

// Migration-created "Other Income" buckets (engineering-decisions: income-month-
// scoping) must never roll forward, nor count toward "N sources to copy".
const ONE_OFF_MARKER = '__one_off_bucket__';

const formatMonth = (ym) =>
  new Date(ym + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

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
  if (financeValues.loading) return <PaydayViewSkeleton />;

  const {
    incomes, allIncomes = [], error, totalReceived, totalExpected, totalPending, totalIncome, txs,
    activeMonth, loadMonth, markReceived, markPending, updateExpectedAmount, copyIncomeSourcesToMonth,
  } = financeValues;

  const currentMonth   = getCurrentMonth();
  const isCurrentMonth = activeMonth === currentMonth;
  const isPastMonth    = activeMonth < currentMonth;   // 'YYYY-MM' compares lexicographically
  const isFutureMonth  = activeMonth > currentMonth;

  // Past months are read-only — income derived from month-scoped txs, not live sources.
  const pastIncomeTxs  = isPastMonth ? txs.filter(t => t.type === 'income') : [];

  // Rollforward source: previous month's non-bucket sources (already in memory —
  // allIncomes holds every month). Drives the empty-state CTA + the sheet list.
  const prevMonth      = offsetMonth(activeMonth, -1);
  const prevSources    = allIncomes.filter(i => i.month === prevMonth && i.notes !== ONE_OFF_MARKER && !i.deleted_at);

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

  // Roll income forward from the previous month. `sourceIds` undefined → copy all
  // non-bucket sources; an array → only the sheet-selected subset. The incomes
  // slice re-derives automatically once allIncomes updates (no manual refetch).
  const handleCopy = async (sourceIds) => {
    setCopying(true);
    setCopyError(null);
    const { data, error: err } = await copyIncomeSourcesToMonth(prevMonth, activeMonth, sourceIds);
    setCopying(false);
    if (err) { setCopyError("Couldn't copy. Try again."); return; }
    setCopySheetOpen(false);
    setCopiedCount(data?.length || 0);
  };

  return (
    <div style={{ padding: '16px 16px 0' }}>

      <PaydayHeader
        monthLabel={formatMonth(activeMonth)}
        isCurrentMonth={isCurrentMonth}
        isFutureMonth={isFutureMonth}
        totalReceived={totalReceived}
        totalPending={totalPending}
        totalIncome={totalIncome}
        fmt={fmt}
        onPrev={() => loadMonth(offsetMonth(activeMonth, -1))}
        onNext={() => loadMonth(offsetMonth(activeMonth, 1))}
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
        isFutureMonth={isFutureMonth}
        isPastMonth={isPastMonth}
        monthLabel={formatMonth(activeMonth)}
        lastMonthLabel={formatMonth(prevMonth)}
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

      <ConfirmSheet
        income={selectedIncome}
        isOpen={sheetOpen}
        onClose={() => { setSheetOpen(false); setMutateError(null); }}
        onConfirm={handleConfirm}
        loading={mutating}
        error={mutateError}
        fmt={fmt}
      />

      <CopyIncomeSheet
        isOpen={copySheetOpen}
        onClose={() => setCopySheetOpen(false)}
        lastMonthLabel={formatMonth(prevMonth)}
        sources={prevSources}
        fmt={fmt}
        onCopy={handleCopy}
        copying={copying}
      />

      {copiedCount > 0 && (
        <Toast
          message={`Copied ${copiedCount} income ${copiedCount === 1 ? 'source' : 'sources'} to ${formatMonth(activeMonth)}`}
          actionLabel="Done"
          onEdit={() => setCopiedCount(0)}
          onDismiss={() => setCopiedCount(0)}
        />
      )}
    </div>
  );
}
