/**
 * views/LogView.jsx
 *
 * Full transaction history — all transactions for the active month.
 * Filter by type, search by category name, edit and delete transactions.
 * Month navigation consistent with DailyView and PaydayView.
 * Reuses TransactionRow from daily/ — no duplication.
 *
 * @param {function} onEditTx — (tx) => void — opens AddTransactionSheet pre-filled
 */

import { useState }               from 'react';
import { useBudgetCentreContext } from '../context/BudgetCentreContext';
import { useFinanceContext }      from '../context/FinanceContext';
import { getCurrentMonth, offsetMonth, groupByDate } from '../lib/finance';
import { Skeleton }               from '../components/ui/Skeleton';
import { TransactionRow }         from './daily/TransactionRow';
import { LogFilterBar }           from './log/LogFilterBar';

const formatMonth = (ym) =>
  new Date(ym + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

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
  const { fmt }                              = useBudgetCentreContext();
  const { txs, loading, error,
          activeMonth, loadMonth,
          deleteTransaction }                = useFinanceContext();
  const [filter,      setFilter]            = useState('all');
  const [search,      setSearch]            = useState('');
  const [deletingId,  setDeletingId]        = useState(null);
  const [deleteError, setDeleteError]       = useState(null);

  if (loading) return <LogViewSkeleton />;

  const isCurrentMonth = activeMonth === getCurrentMonth();

  const filtered = txs
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

      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button onClick={() => loadMonth(offsetMonth(activeMonth, -1))} aria-label="Previous month"
          style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--c-primary, #064e3b)', padding: '4px 8px' }}>
          &#8592;
        </button>
        <p data-testid="log-month-label" style={{ fontSize: 15, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: 0 }}>
          {formatMonth(activeMonth)}
        </p>
        <button onClick={() => loadMonth(offsetMonth(activeMonth, 1))} aria-label="Next month"
          disabled={isCurrentMonth}
          style={{ background: 'none', border: 'none', fontSize: 20, cursor: isCurrentMonth ? 'not-allowed' : 'pointer', color: isCurrentMonth ? 'var(--c-border, #e5e7eb)' : 'var(--c-primary, #064e3b)', padding: '4px 8px' }}>
          &#8594;
        </button>
      </div>

      {/* Filter + Search */}
      <LogFilterBar
        filter={filter}
        onFilter={setFilter}
        search={search}
        onSearch={setSearch}
      />

      {/* Error state */}
      {(error || deleteError) && (
        <div style={{ background: 'var(--c-danger-bg, #fef2f2)', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-danger, #dc2626)', margin: 0 }}>{deleteError || error}</p>
        </div>
      )}

      {/* Transaction list */}
      {dates.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <p style={{ fontSize: 32, margin: '0 0 8px' }}>📭</p>
          <p style={{ fontSize: 14, color: 'var(--c-muted, #9ca3af)', fontWeight: 700 }}>
            {search ? `No transactions matching "${search}"` : 'No transactions this month.'}
          </p>
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
                  disabled={deletingId === tx.id || !isCurrentMonth}
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
