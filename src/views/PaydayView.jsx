/**
 * views/PaydayView.jsx
 *
 * Income confirmation screen — primary data entry point.
 * Users confirm income received each month here.
 * All financial recalculations happen automatically via useFinance.
 *
 * Shows past month warning — income sources are not month-scoped.
 * Month navigation via financeValues.loadMonth.
 *
 * @param {{ financeValues }} props
 */

import { useState }               from 'react';
import { useBudgetCentreContext } from '../context/BudgetCentreContext';
import { useFinanceContext }      from '../context/FinanceContext';
import { getCurrentMonth, offsetMonth } from '../lib/finance';
import { Skeleton }               from '../components/ui/Skeleton';
import { IncomeCard }             from './payday/IncomeCard';
import { ConfirmSheet }           from './payday/ConfirmSheet';

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
  const { fmt }                             = useBudgetCentreContext();
  const financeValues                       = useFinanceContext();
  const [selectedIncome, setSelectedIncome] = useState(null);
  const [sheetOpen,      setSheetOpen]      = useState(false);
  const [mutating,       setMutating]       = useState(false);
  const [mutateError,    setMutateError]    = useState(null);
  const [hoveredNav,     setHoveredNav]     = useState(null);

  if (financeValues.loading) return <PaydayViewSkeleton />;

  const {
    incomes, error, totalReceived, totalExpected, totalPending,
    activeMonth, loadMonth, markReceived, markPending, updateExpectedAmount,
  } = financeValues;

  const isCurrentMonth = activeMonth === getCurrentMonth();

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

  const handleUpdateExpected = async (sourceId, newAmount) => {
    const { error: err } = await updateExpectedAmount(sourceId, newAmount);
    if (err) setMutateError('Could not update expected amount. Please try again.');
  };

  const handleMarkPending = async (sourceId) => {
    setMutating(true);
    const { error: err } = await markPending(sourceId);
    if (err) setMutateError('Could not update income status. Please try again.');
    setMutating(false);
  };

  return (
    <div style={{ padding: '16px 16px 0' }}>

      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button
          onClick={() => loadMonth(offsetMonth(activeMonth, -1))}
          aria-label="Previous month"
          onMouseEnter={() => setHoveredNav('prev')}
          onMouseLeave={() => setHoveredNav(null)}
          style={{ background: hoveredNav === 'prev' ? 'var(--c-accent-light, #f0fdf4)' : 'none', border: 'none', borderRadius: 8, fontSize: 20, cursor: 'pointer', color: 'var(--c-primary, #064e3b)', padding: '4px 8px', transition: 'background .15s' }}
        >
          &#8592;
        </button>
        <p data-testid="payday-month-label" style={{ fontSize: 15, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: 0 }}>
          {formatMonth(activeMonth)}
        </p>
        <button
          onClick={() => loadMonth(offsetMonth(activeMonth, 1))}
          aria-label="Next month"
          disabled={isCurrentMonth}
          onMouseEnter={() => !isCurrentMonth && setHoveredNav('next')}
          onMouseLeave={() => setHoveredNav(null)}
          style={{ background: hoveredNav === 'next' ? 'var(--c-accent-light, #f0fdf4)' : 'none', border: 'none', borderRadius: 8, fontSize: 20, cursor: isCurrentMonth ? 'not-allowed' : 'pointer', color: isCurrentMonth ? 'var(--c-border, #e5e7eb)' : 'var(--c-primary, #064e3b)', padding: '4px 8px', transition: 'background .15s' }}
        >
          &#8594;
        </button>
      </div>

      {/* Summary card */}
      <div style={{ background: 'linear-gradient(135deg, var(--c-header-from,#064e3b), var(--c-header-to,#0d7060))', borderRadius: 16, padding: '16px 18px', marginBottom: 16, color: '#fff', boxShadow: 'var(--c-shadow)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,.7)', margin: '0 0 4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Received</p>
            <p data-testid="payday-total-received" style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>{fmt(totalReceived)}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,.7)', margin: '0 0 4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Pending</p>
            <p data-testid="payday-total-pending" style={{ fontSize: 24, fontWeight: 900, margin: 0, color: totalPending > 0 ? '#fbbf24' : '#6ee7b7' }}>{fmt(totalPending)}</p>
          </div>
        </div>
      </div>

      {/* Past month warning */}
      {!isCurrentMonth && (
        <div style={{ background: 'var(--c-warning-bg, #fef3c7)', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-warning-text, #92400e)', margin: 0 }}>
            Income status shown reflects current state, not historical data.
          </p>
        </div>
      )}

      {/* Error state */}
      {(error || mutateError) && (
        <div style={{ background: 'var(--c-danger-bg, #fef2f2)', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-danger, #dc2626)', margin: 0 }}>
            {mutateError || error}
          </p>
        </div>
      )}

      {/* Income list */}
      {incomes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <p style={{ fontSize: 14, color: 'var(--c-muted, #9ca3af)', fontWeight: 700 }}>
            No income sources set up yet.
          </p>
        </div>
      ) : (
        incomes.map(income => (
          <IncomeCard
            key={income.id}
            income={income}
            fmt={fmt}
            onConfirm={handleOpenSheet}
            onMarkPending={handleMarkPending}
            onUpdateExpected={handleUpdateExpected}
            disabled={mutating}
          />
        ))
      )}

      <ConfirmSheet
        income={selectedIncome}
        isOpen={sheetOpen}
        onClose={() => { setSheetOpen(false); setMutateError(null); }}
        onConfirm={handleConfirm}
        loading={mutating}
        error={mutateError}
        fmt={fmt}
      />
    </div>
  );
}
