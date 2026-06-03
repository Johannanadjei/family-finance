/**
 * hooks/useMoveToCycle.jsx
 *
 * The "move a transaction to another period" flow shared by LogView and DailyView
 * (Commit 12): the move-sheet open state, the destination cycle list, the
 * past-period confirm guard (keyed on EITHER the source OR the chosen-destination
 * cycle being past — Ratification 2), and the optimistic move dispatch. Extracted
 * so neither view duplicates it or breaches the 200-line views cap — same
 * architectural cut as useTransactionMutations / useIncomeMutations.
 *
 * Composes usePastPeriodGuard and re-exposes its ready-to-render modal element, so
 * (like that hook) this one OWNS UI and lives in a .jsx file.
 *
 * Consumer:
 *   const m = useMoveToCycle({ txs, cycles, moveTransaction });
 *   <TransactionRow onMove={m.openMove} moving={m.movingId === tx.id} ... />
 *   <MoveCycleSheet isOpen={!!m.moveTx} cycles={m.moveDestinations}
 *                   onMove={m.confirmMove} onClose={m.closeMove} moving={!!m.movingId} />
 *   {m.moveGuardModal}
 *
 * @param {{ txs: object[], cycles: object[], moveTransaction: Function }} opts
 */

import { useState, useEffect, useRef } from 'react';
import { usePastPeriodGuard } from './usePastPeriodGuard';
import { getToday } from '../lib/dates';

export function useMoveToCycle({ txs = [], cycles = [], moveTransaction }) {
  const [moveTx,      setMoveTx]      = useState(null);   // tx whose sheet is open
  const [pendingMove, setPendingMove] = useState(null);   // { tx, cycleId } awaiting the guard
  const [movingId,    setMovingId]    = useState(null);
  const [moveError,   setMoveError]   = useState(null);
  const pendingMoveRef                = useRef(null);

  // Guard fires when EITHER the source cycle (where the tx sits) OR the chosen
  // destination has ended. Label names whichever is past (destination preferred).
  const today        = getToday();
  const cycleIsPast  = (c) => !!c && c.end_date < today;
  const moveSource   = pendingMove ? cycles.find(c => c.id === pendingMove.tx.cycle_id) : null;
  const moveDest     = pendingMove ? cycles.find(c => c.id === pendingMove.cycleId)     : null;
  const isPast       = cycleIsPast(moveSource) || cycleIsPast(moveDest);
  const periodLabel  = (cycleIsPast(moveDest) ? moveDest : moveSource)?.name ?? 'this period';
  const { requestMutation, guardModal } = usePastPeriodGuard({ isPast, periodLabel });

  const performMove = async (txId, cycleId) => {
    setMovingId(txId);
    setMoveError(null);
    const { error } = await moveTransaction(txId, cycleId);
    setMovingId(null);
    setPendingMove(null);
    pendingMoveRef.current = null;
    if (error) setMoveError('Could not move transaction. Please try again.');
  };

  // Dispatch the pending move through the guard once a destination is chosen. The
  // ref ensures one dispatch per pendingMove even if requestMutation re-keys mid-flow.
  useEffect(() => {
    if (!pendingMove || pendingMoveRef.current === pendingMove) return;
    pendingMoveRef.current = pendingMove;
    requestMutation(() => performMove(pendingMove.tx.id, pendingMove.cycleId));
  }, [pendingMove, requestMutation]);

  // Destinations = live cycles other than the one the tx currently sits in, newest-first.
  const moveDestinations = moveTx
    ? cycles.filter(c => !c.deleted_at && c.id !== moveTx.cycle_id)
            .slice().sort((a, b) => b.start_date.localeCompare(a.start_date))
    : [];

  const openMove    = (id) => { const tx = txs.find(t => t.id === id); if (tx) { setMoveError(null); setMoveTx(tx); } };
  const closeMove   = () => setMoveTx(null);
  const confirmMove = (cycleId) => { setPendingMove({ tx: moveTx, cycleId }); setMoveTx(null); };

  return { moveTx, moveDestinations, movingId, moveError, openMove, closeMove, confirmMove, moveGuardModal: guardModal };
}
