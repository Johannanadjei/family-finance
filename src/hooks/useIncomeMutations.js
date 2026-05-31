/**
 * hooks/useIncomeMutations.js
 *
 * Income-source mutations, extracted from useFinance to keep that hook within
 * the file-size budget. State (incomes, txs) still lives in useFinance and is
 * passed in with its setters — this hook owns no state of its own, only the
 * optimistic-update + rollback logic.
 *
 * Several mutations are two-phase (income_sources row + its linked income
 * transaction) and roll back BOTH phases on failure. The income tx is linked
 * to its source by the income_source_id FK — never by category_name string
 * match, which orphaned the tx on every label edit. See useFinance.js and
 * docs/engineering-decisions.md (income-source-fk).
 */

import { useCallback } from 'react';
import { markReceived as dbMarkReceived, markPending as dbMarkPending, updateExpectedAmount as dbUpdateExpectedAmount, updateIncomeSource as dbUpdateIncomeSource, addIncomeSource as dbAddIncomeSource, bulkAddIncomeSources as dbBulkAddIncomeSources, deleteIncomeSource as dbDeleteIncomeSource } from '../services/income.service';
import { addTransaction as dbAddTransaction, deleteTransaction as dbDeleteTransaction, updateTransaction as dbUpdateTransaction } from '../services/transactions.service';
import { getWeekForDate } from '../lib/finance';

// Load-bearing marker on migration-created "Other Income" buckets (see
// docs/engineering-decisions.md income-month-scoping). One-off buckets are
// already-received, ad-hoc catch-alls — they must NEVER roll forward.
const ONE_OFF_MARKER = '__one_off_bucket__';

export function useIncomeMutations({ centreId, currency, incomes, txs, setIncomes, setTxs }) {

  const markReceived = useCallback(async (sourceId, receivedAmount, actualPayDate) => {
    const income = incomes.find(i => i.id === sourceId);
    if (!income) return { error: new Error('Income source not found') };

    // Phase 1 optimistic — update incomes state
    const prevIncomes = incomes;
    setIncomes(prev => prev.map(i =>
      i.id === sourceId
        ? { ...i, received: true, received_amount: receivedAmount, actual_pay_date: actualPayDate }
        : i
    ));

    // Phase 1 write — update income_sources in Supabase
    const { error: incomeErr } = await dbMarkReceived(sourceId, receivedAmount, actualPayDate);

    if (incomeErr) {
      setIncomes(prevIncomes);
      console.error('[useIncomeMutations] markReceived phase 1 rollback:', incomeErr.message);
      return { error: incomeErr };
    }

    // Phase 2 write — create income transaction
    const today      = actualPayDate || new Date().toISOString().split('T')[0];
    const { data: txData, error: txErr } = await dbAddTransaction(centreId, {
      date:             today,
      week:             getWeekForDate(today),
      type:             'income',
      category_name:    income.label,
      currency:         income.currency || currency,
      amount:           receivedAmount,
      description:      income.label + ' received',
      source:           'main_app',
      // Durable FK link to the source — survives label edits and lets delete /
      // un-confirm find this tx by id instead of by category_name string match.
      income_source_id: sourceId,
    });

    if (txErr) {
      // Phase 2 failed — rollback both phases
      setIncomes(prevIncomes);
      await dbMarkPending(sourceId);
      console.error('[useIncomeMutations] markReceived phase 2 rollback:', txErr.message);
      return { error: txErr };
    }

    // Both phases succeeded — add transaction to local state if read-back succeeded
    if (txData) setTxs(prev => [{ ...txData, _optimistic: false }, ...prev]);
    return { error: null };
  }, [centreId, incomes, currency, setIncomes, setTxs]);

  const markPending = useCallback(async (sourceId) => {
    const income = incomes.find(i => i.id === sourceId);
    if (!income) return { error: new Error('Income source not found') };

    const prevIncomes = incomes;
    const prevTxs     = txs;

    // Find the matching income transaction by FK — robust to label edits, which
    // the old category_name string match was not (orphaned tx → duplicate income).
    const matchingTx = txs.find(t =>
      t.type             === 'income' &&
      t.income_source_id === sourceId &&
      !t.deleted_at
    );

    // Optimistic — reset incomes state
    setIncomes(prev => prev.map(i =>
      i.id === sourceId
        ? { ...i, received: false, received_amount: 0, actual_pay_date: null }
        : i
    ));

    // Optimistic — remove transaction from local state
    if (matchingTx) {
      setTxs(prev => prev.filter(t => t.id !== matchingTx.id));
    }

    // Phase 1 write — reset income_sources
    const { error: incomeErr } = await dbMarkPending(sourceId);

    if (incomeErr) {
      setIncomes(prevIncomes);
      setTxs(prevTxs);
      console.error('[useIncomeMutations] markPending phase 1 rollback:', incomeErr.message);
      return { error: incomeErr };
    }

    // Phase 2 write — soft delete the income transaction
    if (matchingTx) {
      const { error: txErr } = await dbDeleteTransaction(matchingTx.id);

      if (txErr) {
        setIncomes(prevIncomes);
        setTxs(prevTxs);
        await dbMarkReceived(sourceId, income.received_amount, income.actual_pay_date);
        console.error('[useIncomeMutations] markPending phase 2 rollback:', txErr.message);
        return { error: txErr };
      }
    }

    return { error: null };
  }, [incomes, txs, setIncomes, setTxs]);

  const updateExpectedAmount = useCallback(async (sourceId, newAmount, extras = {}) => {
    const prev = incomes.find(i => i.id === sourceId);
    if (!prev) return { error: new Error('Income source not found') };

    const prevIncomes = incomes;
    setIncomes(p => p.map(i =>
      i.id === sourceId ? { ...i, expected_amount: newAmount, ...extras } : i
    ));

    const { error } = await dbUpdateExpectedAmount(sourceId, newAmount, extras);

    if (error) {
      setIncomes(prevIncomes);
      console.error('[useIncomeMutations] updateExpectedAmount rollback:', error.message);
      return { error };
    }

    return { error: null };
  }, [incomes, setIncomes]);

  // Edit a source's label/amount/pay-day. Optimistic on `incomes`. If the edit
  // changes the amount of an already-received source, the linked income tx is
  // reconciled too (two-phase, both roll back) so Home's transaction-derived
  // income reflects the NEW amount instead of the stale one.
  const updateIncomeSource = useCallback(async (sourceId, updates) => {
    const prev = incomes.find(i => i.id === sourceId);
    if (!prev) return { error: new Error('Income source not found') };

    const prevIncomes = incomes;
    const prevTxs     = txs;

    const amountChanged = updates.expected_amount !== undefined
      && Number(updates.expected_amount) !== Number(prev.expected_amount);
    const linkedTx = prev.received
      ? txs.find(t => t.type === 'income' && t.income_source_id === sourceId && !t.deleted_at)
      : null;
    const reconcileTx = amountChanged && !!linkedTx;
    const newAmount   = reconcileTx ? Math.round(Number(updates.expected_amount) || 0) : null;

    // Optimistic — update the source, keeping its confirmed tx + received_amount in sync.
    setIncomes(p => p.map(i => i.id === sourceId
      ? { ...i, ...updates, ...(reconcileTx ? { received_amount: newAmount } : {}) }
      : i));
    if (reconcileTx) setTxs(p => p.map(t => t.id === linkedTx.id ? { ...t, amount: newAmount } : t));

    // Phase 1 — persist the source update.
    const { data, error } = await dbUpdateIncomeSource(sourceId, updates);
    if (error) {
      setIncomes(prevIncomes);
      setTxs(prevTxs);
      console.error('[useIncomeMutations] updateIncomeSource rollback:', error.message);
      return { error };
    }
    setIncomes(p => p.map(i => i.id === sourceId
      ? { ...data, ...(reconcileTx ? { received_amount: newAmount } : {}) }
      : i));

    // Phase 2 — persist the linked tx amount; roll back both phases on failure.
    if (reconcileTx) {
      const { error: txErr } = await dbUpdateTransaction(linkedTx.id, { amount: newAmount });
      if (txErr) {
        setIncomes(prevIncomes);
        setTxs(prevTxs);
        await dbUpdateIncomeSource(sourceId, { expected_amount: prev.expected_amount });
        console.error('[useIncomeMutations] updateIncomeSource tx-reconcile rollback:', txErr.message);
        return { error: txErr };
      }
    }
    return { data, error: null };
  }, [incomes, txs, setIncomes, setTxs]);

  const addIncomeSource = useCallback(async (source) => {
    if (!centreId) return { data: null, error: new Error('No active budget centre') };
    const tempId     = crypto.randomUUID();
    const optimistic = { ...source, id: tempId, budget_centre_id: centreId, received: false, received_amount: 0, _optimistic: true };
    setIncomes(prev => [...prev, optimistic]);
    const { data, error } = await dbAddIncomeSource(centreId, source);
    if (error) {
      setIncomes(prev => prev.filter(i => i.id !== tempId));
      console.error('[useIncomeMutations] addIncomeSource rollback:', error.message);
      return { data: null, error };
    }
    setIncomes(prev => prev.map(i => i.id === tempId ? { ...data, _optimistic: false } : i));
    return { data, error: null };
  }, [centreId, setIncomes]);

  // Roll forward income sources from one month to another (Phase 2B). Copies the
  // recurring "shape" of each source (label, icon, amount, schedule) into the new
  // month as a fresh PENDING source (received=false / received_amount=0 via DB
  // defaults). One-off buckets are filtered out at this data layer too — a
  // backstop to the UI filter — so they never carry forward even if their id is
  // passed explicitly. `incomes` here is the full cross-month allIncomes list.
  //
  // @param {string}   fromMonth — 'YYYY-MM' to copy from
  // @param {string}   toMonth   — 'YYYY-MM' to copy into
  // @param {string[]} [sourceIds] — optional subset; omit to copy ALL non-bucket
  const copyIncomeSourcesToMonth = useCallback(async (fromMonth, toMonth, sourceIds) => {
    if (!centreId) return { data: null, error: new Error('No active budget centre') };

    const toCopy = incomes.filter(i =>
      i.month === fromMonth &&
      i.notes !== ONE_OFF_MARKER &&
      !i.deleted_at &&
      (!sourceIds || sourceIds.includes(i.id))
    );
    if (toCopy.length === 0) return { data: [], error: null };   // nothing to copy — not an error

    // Only the fields a recurring source carries forward. received / received_amount
    // are intentionally omitted — the DB defaults them (pending in the new month),
    // matching the normal add path. notes cleared (buckets already excluded above).
    const newRows = toCopy.map(s => ({
      label:           s.label,
      icon:            s.icon,
      currency:        s.currency,
      expected_amount: s.expected_amount,
      pay_day:         s.pay_day,
      pay_day_type:    s.pay_day_type,
      month:           toMonth,
      notes:           '',
    }));

    // Optimistic — N temp rows, each keyed so rollback/replace targets exactly them.
    const optimistic = newRows.map(r => ({ ...r, id: crypto.randomUUID(), budget_centre_id: centreId, received: false, received_amount: 0, _optimistic: true }));
    const tempIds    = new Set(optimistic.map(o => o.id));
    setIncomes(prev => [...prev, ...optimistic]);

    const { data, error } = await dbBulkAddIncomeSources(centreId, newRows);
    if (error) {
      setIncomes(prev => prev.filter(i => !tempIds.has(i.id)));
      console.error('[useIncomeMutations] copyIncomeSourcesToMonth rollback:', error.message);
      return { data: null, error };
    }

    // Swap the whole temp block for server rows (can't map temp→server by id).
    setIncomes(prev => [...prev.filter(i => !tempIds.has(i.id)), ...(data || []).map(d => ({ ...d, _optimistic: false }))]);
    return { data: data || [], error: null };
  }, [centreId, incomes, setIncomes]);

  const deleteIncomeSource = useCallback(async (sourceId) => {
    const prev = incomes.find(i => i.id === sourceId);
    if (!prev) return { error: new Error('Income source not found') };
    const prevIncomes = incomes;
    const prevTxs     = txs;

    // Linked income tx(s) — by FK. Defensive plural: should be ≤1 post-FK.
    const linkedTxs = txs.filter(t => t.type === 'income' && t.income_source_id === sourceId && !t.deleted_at);

    // Optimistic — drop the source and its linked income tx(s) so the
    // transaction-derived Home income (allIncome) recalculates immediately.
    setIncomes(prevList => prevList.filter(i => i.id !== sourceId));
    if (linkedTxs.length) setTxs(prevList => prevList.filter(t => t.income_source_id !== sourceId));

    // Phase 1 — soft delete the source.
    const { error } = await dbDeleteIncomeSource(sourceId);
    if (error) {
      setIncomes(prevIncomes);
      setTxs(prevTxs);
      console.error('[useIncomeMutations] deleteIncomeSource rollback:', error.message);
      return { error };
    }

    // Phase 2 — soft delete each linked income tx. No restore service exists for
    // either row, so on failure we restore local state and surface the error;
    // the next reload reconciles from the server.
    for (const tx of linkedTxs) {
      const { error: txErr } = await dbDeleteTransaction(tx.id);
      if (txErr) {
        setIncomes(prevIncomes);
        setTxs(prevTxs);
        console.error('[useIncomeMutations] deleteIncomeSource tx rollback:', txErr.message);
        return { error: txErr };
      }
    }
    return { error: null };
  }, [incomes, txs, setIncomes, setTxs]);

  return { markReceived, markPending, updateExpectedAmount, updateIncomeSource, addIncomeSource, copyIncomeSourcesToMonth, deleteIncomeSource };
}
