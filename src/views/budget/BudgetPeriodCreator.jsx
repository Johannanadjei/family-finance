/**
 * views/budget/BudgetPeriodCreator.jsx — Phase B period-creation cluster.
 *
 * Extracted from BudgetView (which sits at the 200-line audit cap) so the orchestrator
 * stays thin. Bundles CreateBudgetPeriodSheet (the quick/custom creator) with the
 * create handler. The open flag is LIFTED to the parent so BudgetHeader's always-visible
 * "New month" button (a BudgetView-owned element) and this cluster share one source of
 * truth — and so the shell banner's "Choose different dates" can raise it via router
 * state. The "no budget month for today" banner used to be mounted here as well; it now
 * has a single mount in DashboardShell, because rendering it here AND on Home showed it
 * twice on the Home → Budget journey.
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
 * @param {object|null} resetCycle   — the cycle to reset (lifted from BudgetHeader's kebab), or null
 * @param {function} onResetDone     — clear the lifted resetCycle (Cancel / after firing)
 */

import { useEffect }               from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useFinanceContext }       from '../../context/FinanceContext';
import { useResetPeriod }          from '../../hooks/useResetPeriod';
import { CreateBudgetPeriodSheet } from './CreateBudgetPeriodSheet';

export function BudgetPeriodCreator({ isOpen, onOpenChange, onCopyRequested, resetCycle = null, onResetDone }) {
  const { cycles = [], createPeriod } = useFinanceContext();
  const navigate = useNavigate();
  const location = useLocation();

  // "Choose different dates" on the shell banner routes to /budget asking for the
  // custom creator. The banner cannot open the sheet itself — the open flag is lifted
  // to BudgetView — so the request arrives as router state and is honoured here, next
  // to the sheet. Cleared immediately (replace) so back or refresh does not re-open it.
  useEffect(() => {
    if (!location.state?.openPeriodCreator) return;
    onOpenChange(true);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state?.openPeriodCreator]);

  // Reset-period confirm + toast. Controlled by the lifted `resetCycle` (the kebab that
  // opens it lives in BudgetHeader, a sibling) — same lift pattern as the create flag.
  const { resetModal } = useResetPeriod({ target: resetCycle, onClose: onResetDone });

  const handleCreatePeriod = async ({ copyPrevious, ...range }) => {
    const { error } = await createPeriod(range);
    if (error) return { error };
    onOpenChange(false);
    if (copyPrevious) onCopyRequested();
    return { error: null };
  };

  return (
    <>
      <CreateBudgetPeriodSheet
        isOpen={isOpen}
        onClose={() => onOpenChange(false)}
        cycles={cycles}
        onCreate={handleCreatePeriod}
      />
      {resetModal}
    </>
  );
}
