/**
 * views/DailyView.jsx
 *
 * Per-cycle transaction log — shows the viewed cycle's transactions grouped by day.
 * Cycle navigation via loadCycle + getCycleNav (the Commit-5 template). The
 * month-keyed data layer follows the cycle through the loadCycle→loadMonth bridge.
 * FAB opens AddTransactionSheet at App.jsx level.
 *
 * @see AddTransactionSheet — rendered in App.jsx, opened via FAB
 */

import { useState }               from 'react';
import { useBudgetCentreContext } from '../context/BudgetCentreContext';
import { useFinanceContext }      from '../context/FinanceContext';
import { useMoveToCycle }         from '../hooks/useMoveToCycle';
import { getCurrentMonth, groupByDate } from '../lib/finance';
import { formatMonth, getToday }   from '../lib/dates';
import { getCycleNav }             from '../lib/cycles';
import { Skeleton }               from '../components/ui/Skeleton';
import { PeriodNav }              from '../components/layout/PeriodNav';
import { TransactionRow }         from './daily/TransactionRow';
import { MoveCycleSheet }         from './daily/MoveCycleSheet';
import { WeeklySummaryBar }       from './daily/WeeklySummaryBar';

const formatDate = (dateStr) =>
  new Date(dateStr).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

function DailyViewSkeleton() {
  return (
    <div style={{ padding: '16px' }}>
      <Skeleton width="50%" height={14} borderRadius={6} />
      <div style={{ marginTop: 12 }}><Skeleton width="100%" height={48} borderRadius={10} /></div>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ marginTop: 16 }}>
          <Skeleton width="30%" height={10} borderRadius={4} />
          <div style={{ marginTop: 8 }}><Skeleton width="100%" height={52} borderRadius={10} /></div>
        </div>
      ))}
    </div>
  );
}

export function DailyView() {
  const { fmt, can }                         = useBudgetCentreContext();
  const { txs, totalSpent, weeklyData,
          loading, cyclesLoading, error, activeMonth,
          cycles = [], visibleCycles = [], activeCycle, activeCycleId, loadCycle, userPlan,
          deleteTransaction, moveTransaction } = useFinanceContext();
  const [deletingId,  setDeletingId]         = useState(null);
  const [deleteError, setDeleteError]        = useState(null);
  // Move-to-period flow (Commit 12) — shared with LogView. Called before the loading
  // return so its hooks run unconditionally (CLAUDE.md §9.5). visibleCycles (not the
  // full list) so a free user can't move a transaction into a hidden period.
  const { moveTx, moveDestinations, movingId, moveError,
          openMove, closeMove, confirmMove, moveGuardModal } =
    useMoveToCycle({ txs, cycles: visibleCycles, moveTransaction });

  // Hold first paint until cycles resolve — else the viewed period / weekly bar
  // flash a stale or empty cycle before the current one loads (cold-load flash).
  if (cyclesLoading) return null;
  if (loading) return <DailyViewSkeleton />;

  // Viewed period: navigated cycle → auto-resolved current cycle → month fallback
  // (brand-new hub before Commit-4 auto-create). `nav` drives bounded prev/next.
  const today          = getToday();
  const currentMonth   = getCurrentMonth();
  const viewedCycle    = visibleCycles.find(c => c.id === activeCycleId) ?? activeCycle ?? null;
  const nav            = getCycleNav(visibleCycles, viewedCycle?.id ?? null);
  const isCurrent      = viewedCycle ? (viewedCycle.start_date <= today && viewedCycle.end_date >= today) : activeMonth === currentMonth;
  const isPast         = viewedCycle ? viewedCycle.end_date < today : activeMonth < currentMonth;
  const periodLabel    = viewedCycle?.name ?? formatMonth(activeMonth);
  // History gate (D6/D8): at-wall upgrade affordance only for a FREE user with older
  // cycles hidden AND on the oldest VISIBLE cycle. Pro / ≤3-cycle hubs → normal disabled.
  const historyLocked  = (userPlan || 'free') === 'free' && cycles.length > visibleCycles.length && nav.isOldest;
  const visibleTxs     = can('viewIncome') ? txs : txs.filter(tx => tx.type === 'expense');
  const grouped        = groupByDate(visibleTxs);
  const dates          = Object.keys(grouped);

  const handleDelete = async (id) => {
    setDeletingId(id);
    setDeleteError(null);
    const { error: err } = await deleteTransaction(id);
    if (err) setDeleteError('Could not delete transaction. Please try again.');
    setDeletingId(null);
  };

  return (
    <div style={{ padding: '16px' }}>

      {/* Period navigation */}
      <PeriodNav
        periodLabel={periodLabel}
        isOldest={nav.isOldest}
        isLatest={nav.isLatest}
        onPrev={() => nav.prev && loadCycle(nav.prev.id)}
        onNext={() => nav.next && loadCycle(nav.next.id)}
        historyLocked={historyLocked}
        labelTestId="daily-period-label"
      />

      {/* Past period warning */}
      {isPast && (
        <div style={{ background: 'var(--c-warning-bg, #fef3c7)', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-warning-text, #92400e)', margin: 0 }}>Viewing a past period — deleting transactions is disabled.</p>
        </div>
      )}

      {/* Period total */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <p style={{ fontSize: 13, color: 'var(--c-muted, #6b7280)', fontWeight: 700, margin: 0 }}>Total spent this period</p>
        <span data-testid="daily-total-spent" style={{ fontSize: 15, fontWeight: 900, color: 'var(--c-text, #1c1917)' }}>{fmt(totalSpent)}</span>
      </div>

      {/* Weekly summary */}
      <WeeklySummaryBar weeklyData={weeklyData} fmt={fmt} activeMonth={activeMonth} />

      {/* Error state */}
      {(error || deleteError || moveError) && (
        <div style={{ background: 'var(--c-danger-bg, #fef2f2)', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-danger, #dc2626)', margin: 0 }}>{moveError || deleteError || error}</p>
        </div>
      )}

      {/* Transaction list */}
      {dates.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '56px 24px 48px' }}>
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true" style={{ margin: '0 auto 16px', display: 'block', opacity: 0.3 }}>
            <rect x="12" y="8" width="40" height="50" rx="4" stroke="var(--c-primary, #064e3b)" strokeWidth="2.5"/>
            <path d="M20 22h24M20 30h24M20 38h16" stroke="var(--c-primary, #064e3b)" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <p style={{ fontSize: 16, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: '0 0 6px' }}>Nothing logged yet</p>
          {isCurrent && (
            <p style={{ fontSize: 13, color: 'var(--c-muted, #9ca3af)', margin: 0, fontWeight: 600 }}>Tap + to add your first expense</p>
          )}
        </div>
      ) : (
        dates.map(date => (
          <div key={date} style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--c-muted, #6b7280)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 1 }}>
              {formatDate(date)}
            </p>
            <div style={{ background: 'var(--c-card, #fff)', borderRadius: 12, padding: '0 14px' }}>
              {grouped[date].map((tx, idx) => (
                <TransactionRow
                  key={tx.id}
                  tx={tx}
                  fmt={fmt}
                  onDelete={handleDelete}
                  onMove={openMove}
                  disabled={deletingId === tx.id || !isCurrent}
                  deleting={deletingId === tx.id}
                  moving={movingId === tx.id}
                  isLast={idx === grouped[date].length - 1}
                />
              ))}
            </div>
          </div>
        ))
      )}

      <MoveCycleSheet
        isOpen={!!moveTx}
        onClose={closeMove}
        cycles={moveDestinations}
        onMove={confirmMove}
        moving={!!movingId}
      />
      {moveGuardModal}
    </div>
  );
}
