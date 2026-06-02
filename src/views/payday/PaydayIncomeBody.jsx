/**
 * views/payday/PaydayIncomeBody.jsx
 *
 * The period-aware income list for the Payday screen:
 *   • future period → "nothing yet" placeholder
 *   • past period   → read-only income transactions (or an empty placeholder)
 *   • current period, no sources → the rollforward empty state (NoIncomeSourcesEmpty)
 *   • current period, with sources → editable IncomeCard list
 *
 * Pure orchestration of already-built sub-components — owns no state. Extracted
 * from PaydayView to keep that orchestrator within the 200-line audit limit once
 * the 2B rollforward flow landed (same move as PaydayHeader / IncomeSourcesSection).
 */

import { IncomeCard }           from './IncomeCard';
import { PastIncomeCard }       from './PastIncomeCard';
import { MonthEmptyState }      from './MonthEmptyState';
import { NoIncomeSourcesEmpty } from './NoIncomeSourcesEmpty';

export function PaydayIncomeBody({
  isFuture, isPast, periodLabel, prevPeriodLabel,
  pastIncomeTxs, incomes, fmt, mutating,
  prevSourceCount, copying, copyError,
  onCopyAll, onChooseWhich, onAddManually,
  onConfirm, onMarkPending, onUpdateExpected,
}) {
  if (isFuture) {
    return (
      <MonthEmptyState
        title={`No payday data for ${periodLabel} yet`}
        subtitle="Income will appear here once this period arrives."
      />
    );
  }

  if (isPast) {
    if (pastIncomeTxs.length === 0) {
      return <MonthEmptyState title={`No income recorded for ${periodLabel}`} />;
    }
    return pastIncomeTxs.map(tx => (
      <PastIncomeCard key={tx.id} name={tx.category_name} amount={fmt(tx.amount)} />
    ));
  }

  if (incomes.length === 0) {
    return (
      <NoIncomeSourcesEmpty
        monthLabel={periodLabel}
        lastMonthLabel={prevPeriodLabel}
        prevSourceCount={prevSourceCount}
        onCopyAll={onCopyAll}
        onChooseWhich={onChooseWhich}
        onAddManually={onAddManually}
        copying={copying}
        copyError={copyError}
      />
    );
  }

  return incomes.map(income => (
    <IncomeCard
      key={income.id}
      income={income}
      fmt={fmt}
      onConfirm={onConfirm}
      onMarkPending={onMarkPending}
      onUpdateExpected={onUpdateExpected}
      disabled={mutating}
    />
  ));
}
