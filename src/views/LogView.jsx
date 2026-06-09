/**
 * views/LogView.jsx
 *
 * Full transaction history — all transactions for the viewed cycle.
 * Filter by type, search by category name, edit and delete transactions.
 * Cycle navigation via loadCycle + getCycleNav (the Commit-5 template), consistent
 * with DailyView and PaydayView; the month-keyed data follows through the bridge.
 * Reuses TransactionRow from daily/ — no duplication.
 *
 * @param {function} onEditTx — (tx) => void — opens AddTransactionSheet pre-filled
 */

import { useState }               from 'react';
import { useBudgetCentreContext } from '../context/BudgetCentreContext';
import { useFinanceContext }      from '../context/FinanceContext';
import { useMoveToCycle }         from '../hooks/useMoveToCycle';
import { AccessBlocked }         from '../components/ui/AccessBlocked';
import { getCurrentMonth, groupByDate } from '../lib/finance';
import { formatMonth, getToday }   from '../lib/dates';
import { getCycleNav }             from '../lib/cycles';
import { Skeleton }               from '../components/ui/Skeleton';
import { PeriodNav }              from '../components/layout/PeriodNav';
import { TransactionRow }         from './daily/TransactionRow';
import { MoveCycleSheet }         from './daily/MoveCycleSheet';
import { LogFilterBar }           from './log/LogFilterBar';

const formatDate = (dateStr) =>
  new Date(dateStr).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

function LogViewSkeleton() {
  return (
    <div style={{ padding: '16px' }}>
      <Skeleton width="50%" height={14} borderRadius={6} />
      <div style={{ marginTop: 12 }}><Skeleton width="100%" height={40} borderRadius={10} /></div>
      <div style={{ marginTop: 8 }}><Skeleton width="100%" height={36} borderRadius={10} /></div>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{ marginTop: 16 }}>
          <Skeleton width="30%" height={10} borderRadius={4} />
          <div style={{ marginTop: 8 }}><Skeleton width="100%" height={52} borderRadius={10} /></div>
        </div>
      ))}
    </div>
  );
}

export function LogView({ onEditTx }) {
  const { fmt, can, currentUserId }          = useBudgetCentreContext();
  const { txs, loading, cyclesLoading, error,
          activeMonth, cycles = [], visibleCycles = [], activeCycle, activeCycleId, loadCycle, userPlan,
          deleteTransaction, moveTransaction } = useFinanceContext();
  const [filter,      setFilter]            = useState('all');
  const [search,      setSearch]            = useState('');
  const [deletingId,  setDeletingId]        = useState(null);
  const [deleteError, setDeleteError]       = useState(null);
  // Move-to-period flow (Commit 12) — shared with DailyView. Called before any early
  // return so its hooks run unconditionally (CLAUDE.md §9.5). visibleCycles (not the
  // full list) so a free user can't move a transaction into a hidden period.
  const { moveTx, moveDestinations, movingId, moveError,
          openMove, closeMove, confirmMove, moveGuardModal } =
    useMoveToCycle({ txs, cycles: visibleCycles, moveTransaction });

  if (!can('log')) return <AccessBlocked message="The transaction log is not available for your role." />;
  // Hold first paint until cycles resolve — else the viewed-period filter/labels
  // flash a stale or empty cycle before the current one loads (cold-load flash).
  if (cyclesLoading) return null;
  if (loading) return <LogViewSkeleton />;

  // Viewed period: navigated cycle → auto-resolved current cycle → month fallback
  // (brand-new hub before Commit-4 auto-create). `nav` drives bounded prev/next.
  const today          = getToday();
  const currentMonth   = getCurrentMonth();
  const viewedCycle    = visibleCycles.find(c => c.id === activeCycleId) ?? activeCycle ?? null;
  const nav            = getCycleNav(visibleCycles, viewedCycle?.id ?? null);
  const isCurrent      = viewedCycle ? (viewedCycle.start_date <= today && viewedCycle.end_date >= today) : activeMonth === currentMonth;
  const periodLabel    = viewedCycle?.name ?? formatMonth(activeMonth);
  // History gate (D6/D8): at-wall upgrade affordance only for a FREE user with older
  // cycles hidden AND on the oldest VISIBLE cycle. Pro / ≤3-cycle hubs → normal disabled.
  const historyLocked  = (userPlan || 'free') === 'free' && cycles.length > visibleCycles.length && nav.isOldest;
  const showAllTxs     = can('viewAllTxs');
  const showIncome     = can('viewIncome');

  const filtered = txs
    .filter(tx => showIncome || tx.type === 'expense')
    .filter(tx => showAllTxs || !currentUserId || tx.logged_by_user_id === currentUserId)
    .filter(tx => filter === 'all' || tx.type === filter)
    .filter(tx => !search || tx.category_name.toLowerCase().includes(search.toLowerCase()));

  const grouped = groupByDate(filtered);
  const dates   = Object.keys(grouped);

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
        labelTestId="log-period-label"
      />

      {/* Filter + Search */}
      <LogFilterBar
        filter={filter}
        onFilter={setFilter}
        search={search}
        onSearch={setSearch}
        showIncome={showIncome}
      />

      {/* Error state */}
      {(error || deleteError || moveError) && (
        <div style={{ background: 'var(--c-danger-bg, #fef2f2)', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-danger, #dc2626)', margin: 0 }}>{moveError || deleteError || error}</p>
        </div>
      )}

      {/* Transaction list */}
      {dates.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '56px 24px 48px' }}>
          {txs.length === 0 ? (
            <>
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true" style={{ margin: '0 auto 16px', display: 'block', opacity: 0.3 }}>
                <rect x="12" y="8" width="40" height="50" rx="4" stroke="var(--c-primary, #064e3b)" strokeWidth="2.5"/>
                <path d="M20 22h24M20 30h24M20 38h16" stroke="var(--c-primary, #064e3b)" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <p style={{ fontSize: 16, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: '0 0 6px' }}>Nothing logged yet</p>
              {isCurrent && (
                <p style={{ fontSize: 13, color: 'var(--c-muted, #9ca3af)', margin: 0, fontWeight: 600 }}>Tap + to log your first transaction</p>
              )}
            </>
          ) : (
            <>
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true" style={{ margin: '0 auto 16px', display: 'block', opacity: 0.3 }}>
                <circle cx="28" cy="28" r="16" stroke="var(--c-primary, #064e3b)" strokeWidth="2.5"/>
                <path d="M40 40l10 10" stroke="var(--c-primary, #064e3b)" strokeWidth="2.5" strokeLinecap="round"/>
                <path d="M22 28h12M28 22v12" stroke="var(--c-primary, #064e3b)" strokeWidth="2" strokeLinecap="round" opacity="0.4"/>
              </svg>
              <p style={{ fontSize: 16, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: '0 0 6px' }}>No results found</p>
              <p style={{ fontSize: 13, color: 'var(--c-muted, #9ca3af)', margin: 0, fontWeight: 600 }}>
                {search ? `No transactions matching "${search}"` : `No ${filter} transactions this period`}
              </p>
            </>
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
