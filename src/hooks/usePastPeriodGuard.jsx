/**
 * hooks/usePastPeriodGuard.jsx
 *
 * Gates mutations on a budget period (cycle) that has ENDED behind a confirm modal.
 * When `isPast` is false, mutations run immediately; when true, the action is held
 * and a "Edit past period?" ConfirmModal is shown — Continue runs it, Cancel drops it.
 *
 * Returns a ready-to-render `guardModal` element (renders null while closed), so the
 * consumer just does: `const { requestMutation, guardModal } = usePastPeriodGuard(...)`
 * then `requestMutation(() => doThing())` and `{guardModal}` in its JSX.
 *
 * NOTE ON .jsx: this hook OWNS UI (it returns a React element), so it lives in a .jsx
 * file. Data-only hooks in this codebase stay .js — only hooks that return JSX are .jsx.
 *
 * Reusable across every cycle-migrated view that mutates a viewable past period
 * (BudgetView is the first consumer; Payday/Daily/Log adopt it when their per-period
 * mutation UX is extended).
 *
 * @param {{ isPast: boolean, periodLabel: string }} opts
 * @returns {{ requestMutation: (action: Function) => void, guardModal: JSX.Element }}
 */

import { useState, useRef, useCallback } from 'react';
import { ConfirmModal } from '../components/ui/ConfirmModal';

export function usePastPeriodGuard({ isPast, periodLabel }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pendingAction = useRef(null);

  const requestMutation = useCallback((action) => {
    if (isPast) {
      pendingAction.current = action;
      setConfirmOpen(true);
    } else {
      action();
    }
  }, [isPast]);

  const runPending = useCallback(() => {
    setConfirmOpen(false);
    const a = pendingAction.current;
    pendingAction.current = null;
    a?.();
  }, []);

  const cancelPending = useCallback(() => {
    setConfirmOpen(false);
    pendingAction.current = null;
  }, []);

  const guardModal = (
    <ConfirmModal
      open={confirmOpen}
      title="Edit past period?"
      body={`You're changing ${periodLabel}, which has ended. Continue?`}
      confirmLabel="Continue"
      cancelLabel="Cancel"
      onConfirm={runPending}
      onCancel={cancelPending}
    />
  );

  return { requestMutation, guardModal };
}
