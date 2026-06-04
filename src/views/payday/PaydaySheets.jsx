/**
 * views/payday/PaydaySheets.jsx — the Payday view's modal/overlay host.
 *
 * Extracted from PaydayView to keep that orchestrator under the 200-line audit cap
 * once the cold-load flash fix added a cyclesLoading gate (mirrors BudgetSheets).
 * Pure plumbing: it mounts the three leaf surfaces (confirm-income sheet, copy-income
 * rollforward sheet, and the "copied N" success toast) and forwards props. No logic
 * of its own — the parent still owns all the state and handlers.
 *
 * fmt comes from context (BudgetCentreContext) so the parent need not thread it.
 *
 * @param {object|null} income           — the income source being confirmed
 * @param {boolean}     confirmOpen      — ConfirmSheet open flag
 * @param {function}    onCloseConfirm
 * @param {function}    onConfirm        — (sourceId, amount, date) => Promise
 * @param {boolean}     mutating         — a confirm is in flight
 * @param {string|null} mutateError      — confirm error message
 * @param {boolean}     copyOpen         — CopyIncomeSheet open flag
 * @param {function}    onCloseCopy
 * @param {string}      prevPeriodLabel  — previous period label, e.g. "May 2026"
 * @param {object[]}    prevSources      — previous period's income sources
 * @param {function}    onCopy           — (selectedIds) => void
 * @param {boolean}     copying          — a copy is in flight
 * @param {number}      copiedCount      — >0 → success toast
 * @param {string}      periodLabel      — viewed period label (toast target)
 * @param {function}    onDismissToast
 */

import { useBudgetCentreContext } from '../../context/BudgetCentreContext';
import { Toast }                  from '../../components/ui/Toast';
import { ConfirmSheet }           from './ConfirmSheet';
import { CopyIncomeSheet }        from './CopyIncomeSheet';

export function PaydaySheets({
  income, confirmOpen, onCloseConfirm, onConfirm, mutating, mutateError,
  copyOpen, onCloseCopy, prevPeriodLabel, prevSources, onCopy, copying,
  copiedCount, periodLabel, onDismissToast,
}) {
  const { fmt } = useBudgetCentreContext();

  return (
    <>
      <ConfirmSheet
        income={income}
        isOpen={confirmOpen}
        onClose={onCloseConfirm}
        onConfirm={onConfirm}
        loading={mutating}
        error={mutateError}
        fmt={fmt}
      />

      <CopyIncomeSheet
        isOpen={copyOpen}
        onClose={onCloseCopy}
        lastMonthLabel={prevPeriodLabel}
        sources={prevSources}
        fmt={fmt}
        onCopy={onCopy}
        copying={copying}
      />

      {copiedCount > 0 && (
        <Toast
          message={`Copied ${copiedCount} income ${copiedCount === 1 ? 'source' : 'sources'} to ${periodLabel}`}
          actionLabel="Done"
          onEdit={onDismissToast}
          onDismiss={onDismissToast}
        />
      )}
    </>
  );
}
