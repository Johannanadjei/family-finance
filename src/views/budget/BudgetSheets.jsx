/**
 * views/budget/BudgetSheets.jsx — the Budget view's modal/overlay host.
 *
 * Extracted from BudgetView to keep that orchestrator under the 200-line audit cap
 * once Phase B added the period creator. Pure plumbing: it mounts the three leaf
 * surfaces (add-category sheet, copy-categories rollforward sheet, and the
 * "copied N" success toast) and forwards props. No logic of its own — the parent
 * still owns all the state, handlers, and the past-period guard modal.
 *
 * fmt comes from context (BudgetCentreContext) so the parent need not thread it.
 *
 * @param {boolean}  addOpen          — AddCategorySheet open flag
 * @param {function} onCloseAdd
 * @param {function} onAdd            — (category) => Promise
 * @param {string}   targetMonth      — viewed cycle's 'YYYY-MM'
 * @param {boolean}  copyOpen         — CopyCategoriesSheet open flag
 * @param {function} onCloseCopy
 * @param {string}   prevPeriodLabel  — previous period label, e.g. "May 2026"
 * @param {object[]} prevCategories   — previous period's categories
 * @param {function} onCopy           — (selectedIds) => void
 * @param {boolean}  copying          — a copy is in flight
 * @param {number}   copiedCount      — >0 → success toast
 * @param {string}   periodLabel      — viewed period label (toast target)
 * @param {function} onDismissToast
 */

import { useBudgetCentreContext } from '../../context/BudgetCentreContext';
import { Toast }                  from '../../components/ui/Toast';
import { AddCategorySheet }       from './AddCategorySheet';
import { CopyCategoriesSheet }    from './CopyCategoriesSheet';

export function BudgetSheets({
  addOpen, onCloseAdd, onAdd, targetMonth,
  copyOpen, onCloseCopy, prevPeriodLabel, prevCategories, onCopy, copying,
  copiedCount, periodLabel, onDismissToast,
}) {
  const { fmt } = useBudgetCentreContext();

  return (
    <>
      <AddCategorySheet
        isOpen={addOpen}
        onClose={onCloseAdd}
        onAdd={onAdd}
        targetMonth={targetMonth}
      />

      <CopyCategoriesSheet
        isOpen={copyOpen}
        onClose={onCloseCopy}
        lastMonthLabel={prevPeriodLabel}
        categories={prevCategories}
        fmt={fmt}
        onCopy={onCopy}
        copying={copying}
      />

      {copiedCount > 0 && (
        <Toast
          message={`Copied ${copiedCount} budget ${copiedCount === 1 ? 'category' : 'categories'} to ${periodLabel}`}
          actionLabel="Done"
          onEdit={onDismissToast}
          onDismiss={onDismissToast}
        />
      )}
    </>
  );
}
