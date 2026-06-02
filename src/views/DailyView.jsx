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
import { getCurrentMonth, groupByDate } from '../lib/finance';
import { formatMonth, getToday }   from '../lib/dates';
import { getCycleNav }             from '../lib/cycles';
import { Skeleton }               from '../components/ui/Skeleton';
import { TransactionRow }         from './daily/TransactionRow';
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
          loading, error, activeMonth,
          cycles = [], activeCycle, activeCycleId, loadCycle,
          deleteTransaction }                 = useFinanceContext();
  const [deletingId,  setDeletingId]         = useState(null);
  const [deleteError, setDeleteError]        = useState(null);

  if (loading) return <DailyViewSkeleton />;

  // Viewed period: navigated cycle → auto-resolved current cycle → month fallback
  // (brand-new hub before Commit-4 auto-create). `nav` drives bounded prev/next.
  const today          = getToday();
  const currentMonth   = getCurrentMonth();
  const viewedCycle    = cycles.find(c => c.id === activeCycleId) ?? activeCycle ?? null;
  const nav            = getCycleNav(cycles, viewedCycle?.id ?? null);
  const isCurrent      = viewedCycle ? (viewedCycle.start_date <= today && viewedCycle.end_date >= today) : activeMonth === currentMonth;
  const isPast         = viewedCycle ? viewedCycle.end_date < today : activeMonth < currentMonth;
  const periodLabel    = viewedCycle?.name ?? formatMonth(activeMonth);
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button onClick={() => nav.prev && loadCycle(nav.prev.id)} aria-label="Previous period" disabled={nav.isOldest} style={{ background: 'none', border: 'none', padding: '8px', cursor: nav.isOldest ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: nav.isOldest ? 'var(--c-border, #e5e7eb)' : 'var(--c-primary, #064e3b)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <p data-testid="daily-period-label" style={{ fontSize: 15, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: 0 }}>{periodLabel}</p>
        <button onClick={() => nav.next && loadCycle(nav.next.id)} aria-label="Next period" disabled={nav.isLatest} style={{ background: 'none', border: 'none', padding: '8px', cursor: nav.isLatest ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: nav.isLatest ? 'var(--c-border, #e5e7eb)' : 'var(--c-primary, #064e3b)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>

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
      {(error || deleteError) && (
        <div style={{ background: 'var(--c-danger-bg, #fef2f2)', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-danger, #dc2626)', margin: 0 }}>{deleteError || error}</p>
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
                  disabled={deletingId === tx.id || !isCurrent}
                  deleting={deletingId === tx.id}
                  isLast={idx === grouped[date].length - 1}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
