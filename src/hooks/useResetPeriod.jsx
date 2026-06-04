/**
 * hooks/useResetPeriod.jsx
 *
 * Owns the "Reset budget period" confirmation flow: the destructive ConfirmModal, the
 * resetPeriod call (from FinanceContext), and the error Toast. Mirrors the shape of
 * usePastPeriodGuard — a hook that returns a ready-to-render element so the consumer
 * just drops `{resetModal}` into its JSX.
 *
 * CONTROLLED, not self-triggering. The kebab that opens this lives in BudgetHeader
 * (rendered by BudgetView), while the modal is hosted by BudgetPeriodCreator — siblings.
 * So the open trigger is a lifted `target` (the cycle being reset, or null), passed in
 * by the host, exactly as `periodOpen` is lifted for the create sheet. `onClose` clears
 * that lifted state.
 *
 * Flow (Decision F2): on confirm, close the modal optimistically, then call resetPeriod.
 * On failure (CYC04 future-only / role-denied), surface a Toast — the modal API stays
 * minimal (no in-modal loading/error). On success, resetPeriod has refreshed cycles + txs,
 * but categories live in useBudgetCentre (a separate context), so we also call its
 * reloadCategories — without it the wiped categories stay visible until a hard refresh.
 * This hook bridges both contexts; that cross-context re-sync is the whole point.
 *
 * NOTE ON .jsx: returns JSX, so it lives in a .jsx file (same convention as
 * usePastPeriodGuard) — data-only hooks stay .js.
 *
 * @param {{ target: object|null, onClose: () => void }} opts
 *   target  — the cycle row to reset (its name + id), or null when closed.
 *   onClose — clear the lifted target (Cancel, or after firing the reset).
 * @returns {{ resetModal: JSX.Element }}
 */

import { useState, useCallback } from 'react';
import { useFinanceContext }      from '../context/FinanceContext';
import { useBudgetCentreContext } from '../context/BudgetCentreContext';
import { ConfirmModal }       from '../components/ui/ConfirmModal';
import { Toast }              from '../components/ui/Toast';

export function useResetPeriod({ target, onClose }) {
  const { resetPeriod }      = useFinanceContext();
  const { reloadCategories } = useBudgetCentreContext();
  const [errorToast, setErrorToast] = useState(null);

  const handleConfirm = useCallback(async () => {
    const cycle = target;
    onClose();                         // optimistic close (Decision F2)
    if (!cycle) return;
    const { error } = await resetPeriod(cycle.id);
    if (error) { setErrorToast("Couldn't reset this period. Please try again."); return; }
    // resetPeriod refreshed cycles + txs; categories live in useBudgetCentre, so re-sync
    // that stale slice here (cross-context bridge — see docs/engineering-decisions.md).
    await reloadCategories();
  }, [target, onClose, resetPeriod, reloadCategories]);

  const name = target?.name ?? 'this period';

  const resetModal = (
    <>
      <ConfirmModal
        open={!!target}
        title={`Reset ${name}?`}
        body={`Your budget plan and any transactions in this period will be cleared. This affects only ${name} — other periods are not changed.`}
        confirmLabel="Reset"
        cancelLabel="Cancel"
        confirmTone="danger"
        onConfirm={handleConfirm}
        onCancel={onClose}
      />
      {errorToast && (
        <Toast
          message={errorToast}
          actionLabel="Dismiss"
          onEdit={() => setErrorToast(null)}
          onDismiss={() => setErrorToast(null)}
        />
      )}
    </>
  );

  return { resetModal };
}
