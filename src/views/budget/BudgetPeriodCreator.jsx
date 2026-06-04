/**
 * views/budget/BudgetPeriodCreator.jsx — Phase B period-creation cluster.
 *
 * Extracted from BudgetView (which sits at the 200-line audit cap) so the orchestrator
 * stays thin. Bundles the two pieces that always travel together:
 *   • NoCurrentPeriodPrompt — the passive "today has no period" banner (self-hiding)
 *   • CreateBudgetPeriodSheet — the quick/custom creator
 * plus the create handler. The open flag is LIFTED to the parent so BudgetHeader's
 * always-visible "+ New budget period" button (a BudgetView-owned element) and this
 * cluster share one source of truth.
 *
 * On a successful create, createPeriod (useFinance) already refreshed the cycles and
 * selected the new period; here we just close the sheet and, when the user asked to
 * copy from the previous budget, signal the parent to open its CopyCategoriesSheet
 * against the freshly-selected (now empty) period — Decision 5.
 *
 * Reads cycles + createPeriod straight from FinanceContext so the parent's mount
 * stays to the lifted open flag and the copy hand-off.
 *
 * @param {boolean}  isOpen
 * @param {function} onOpenChange    — (next: boolean) => void; lifted open state
 * @param {function} onCopyRequested — open the parent's CopyCategoriesSheet
 */

import { useFinanceContext }       from '../../context/FinanceContext';
import { NoCurrentPeriodPrompt }   from '../../components/NoCurrentPeriodPrompt';
import { CreateBudgetPeriodSheet } from './CreateBudgetPeriodSheet';

export function BudgetPeriodCreator({ isOpen, onOpenChange, onCopyRequested }) {
  const { cycles = [], createPeriod } = useFinanceContext();

  const handleCreatePeriod = async ({ copyPrevious, ...range }) => {
    const { error } = await createPeriod(range);
    if (error) return { error };
    onOpenChange(false);
    if (copyPrevious) onCopyRequested();
    return { error: null };
  };

  return (
    <>
      <NoCurrentPeriodPrompt cycles={cycles} onCreate={() => onOpenChange(true)} />
      <CreateBudgetPeriodSheet
        isOpen={isOpen}
        onClose={() => onOpenChange(false)}
        onCreate={handleCreatePeriod}
      />
    </>
  );
}
