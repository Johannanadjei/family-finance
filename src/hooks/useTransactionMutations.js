/**
 * hooks/useTransactionMutations.js
 *
 * Transaction mutations, extracted from useFinance to keep that hook within the
 * file-size budget (it was at 443/450 before the Commit-12 move was added) and to
 * give transaction-level corrective actions a clean home — symmetric with
 * useIncomeMutations. State (txs) still lives in useFinance and is passed in with
 * its setter; this hook owns no state of its own, only the optimistic-update +
 * rollback logic.
 *
 * Every mutation follows the optimistic-update + rollback contract (CLAUDE.md §5):
 * apply locally, write to Supabase, roll back the local change on error.
 */

import { useCallback } from 'react';
import {
  addTransaction as dbAddTransaction,
  updateTransaction as dbUpdateTransaction,
  deleteTransaction as dbDeleteTransaction,
  moveTransactionToCycle as dbMoveTransactionToCycle,
} from '../services/transactions.service';

export function useTransactionMutations({ centreId, txs, setTxs }) {

  const addTransaction = useCallback(async (tx) => {
    if (!centreId) return { data: null, error: new Error('No active budget centre') };

    const tempId     = crypto.randomUUID();
    const optimistic = {
      ...tx,
      id:               tempId,
      budget_centre_id: centreId,
      _optimistic:      true,
    };

    setTxs(prev => [optimistic, ...prev]);

    const { data, error } = await dbAddTransaction(centreId, tx);

    if (error) {
      setTxs(prev => prev.filter(t => t.id !== tempId));
      console.error('[useTransactionMutations] addTransaction rollback:', error.message);
      return { data: null, error };
    }

    if (data) {
      setTxs(prev => prev.map(t => t.id === tempId ? { ...data, _optimistic: false } : t));
    } else {
      // Insert succeeded but RLS blocked read-back — keep all optimistic field values,
      // just clear the flag so the row is no longer dimmed/disabled.
      setTxs(prev => prev.map(t => t.id === tempId ? { ...t, _optimistic: false } : t));
    }
    return { data, error: null };
  }, [centreId, setTxs]);

  const updateTransaction = useCallback(async (transactionId, updates) => {
    const prev = txs.find(t => t.id === transactionId);
    if (!prev) return { data: null, error: new Error('Transaction not found') };

    setTxs(prevTxs => prevTxs.map(t => t.id === transactionId ? { ...t, ...updates } : t));

    const { data, error } = await dbUpdateTransaction(transactionId, updates);

    if (error) {
      setTxs(prevTxs => prevTxs.map(t => t.id === transactionId ? prev : t));
      console.error('[useTransactionMutations] updateTransaction rollback:', error.message);
      return { data: null, error };
    }

    setTxs(prevTxs => prevTxs.map(t => t.id === transactionId ? { ...data, _optimistic: false } : t));
    return { data, error: null };
  }, [txs, setTxs]);

  // Move a transaction to another cycle (Commit 12). The date is preserved — only
  // cycle_id changes (Path 2). txs holds the SINGLE viewed cycle's rows, so a move
  // OUT of it just removes the row; the moved tx surfaces when the user navigates
  // to the destination cycle (which refetches by cycle_id). On failure, restore.
  const moveTransaction = useCallback(async (transactionId, cycleId) => {
    const prev = txs.find(t => t.id === transactionId);
    if (!prev) return { data: null, error: new Error('Transaction not found') };

    setTxs(prevTxs => prevTxs.filter(t => t.id !== transactionId));

    const { data, error } = await dbMoveTransactionToCycle(transactionId, cycleId);

    if (error) {
      setTxs(prevTxs => [prev, ...prevTxs]);
      console.error('[useTransactionMutations] moveTransaction rollback:', error.message);
      return { data: null, error };
    }

    return { data, error: null };
  }, [txs, setTxs]);

  const deleteTransaction = useCallback(async (transactionId) => {
    const prev = txs.find(t => t.id === transactionId);
    if (!prev) return { error: new Error('Transaction not found') };

    setTxs(prevTxs => prevTxs.filter(t => t.id !== transactionId));

    const { error } = await dbDeleteTransaction(transactionId);

    if (error) {
      setTxs(prevTxs => [prev, ...prevTxs]);
      console.error('[useTransactionMutations] deleteTransaction rollback:', error.message);
      return { error };
    }

    return { error: null };
  }, [txs, setTxs]);

  return { addTransaction, updateTransaction, moveTransaction, deleteTransaction };
}
