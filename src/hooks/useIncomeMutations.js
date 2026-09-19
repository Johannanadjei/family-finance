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
import { markReceived as dbMarkReceived, markPending as dbMarkPending, updateExpectedAmount as dbUpdateExpectedAmount, updateIncomeSource as dbUpdateIncomeSource, addIncomeSource as dbAddIncomeSource, bulkAddIncomeSources as dbBulkAddIncomeSources, deleteIncomeSource as dbDeleteIncomeSource, moveIncomeSourceToCycle as dbMoveIncomeSourceToCycle } from '../services/income.service';
import { addTransaction as dbAddTransaction, deleteTransaction as dbDeleteTransaction, updateTransaction as dbUpdateTransaction } from '../services/transactions.service';
import { getWeekForDate } from '../lib/finance';
import { sliceByCycle } from '../lib/cycles';

// Load-bearing marker on migration-created "Other Income" buckets (see
// docs/engineering-decisions.md income-month-scoping). One-off buckets are
// already-received, ad-hoc catch-alls — they must NEVER roll forward.
const ONE_OFF_MARKER = '__one_off_bucket__';

export function useIncomeMutations({ centreId, currency, cycles, incomes, txs, setIncomes, setTxs }) {

  /**
   * Confirm a payday receipt. ONE server call (#4b) — the RPC owns idempotency and
   * atomicity, so this hook no longer orchestrates two writes or rolls them back.
   *
   * The optimistic update no longer touches income_sources' deprecated cache
   * columns: `received` is DERIVED from transactions in useFinance, so adding the
   * transaction optimistically is what flips the card to received. Writing both
   * would be writing the same fact twice — which is the bug this closes.
   */
  const markReceived = useCallback(async (sourceId, receivedAmount, actualPayDate) => {
    const income = incomes.find(i => i.id === sourceId);
    if (!income) return { error: new Error('Income source not found') };

    const prevTxs = txs;
    const when    = actualPayDate || new Date().toISOString().split('T')[0];

    // Optimistic: replace an existing live receipt for this source in-place if there
    // is one (mirrors the RPC's own update-or-insert), else prepend a temp row.
    const existing = txs.find(t => t.type === 'income' && t.income_source_id === sourceId && !t.deleted_at);
    setTxs(prev => existing
      ? prev.map(t => (t.id === existing.id ? { ...t, amount: receivedAmount, date: when, _optimistic: true } : t))
      : [{
          id: crypto.randomUUID(), type: 'income', amount: receivedAmount, date: when,
          week: getWeekForDate(when), category_name: income.label, currency,
          description: income.label + ' received', source: 'main_app',
          income_source_id: sourceId, cycle_id: income.cycle_id, _optimistic: true,
        }, ...prev]);

    const { data, error } = await dbMarkReceived(sourceId, receivedAmount, actualPayDate);

    if (error) {
      setTxs(prevTxs);
      console.error('[useIncomeMutations] markReceived rollback:', error.message);
      return { error };
    }

    // Settle the optimistic row against the server's authoritative transaction id.
    setTxs(prev => prev.map(t => (
      (t.income_source_id === sourceId && t.type === 'income' && t._optimistic)
        ? { ...t, id: data?.transaction_id ?? t.id, amount: data?.amount ?? t.amount, date: data?.date ?? t.date, _optimistic: false }
        : t
    )));
    return { error: null };
  }, [incomes, currency, txs, setTxs]);

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

  /**
   * Add an income source to a SPECIFIC budget period. `cycle_id` is the only period
   * key: it comes in from the caller's period picker, and `month` is DERIVED from the
   * cycle's start_date for the NOT NULL column and the display paths — stored, never
   * resolved back from. The old month→cycle lookup mis-stamped on hubs with two
   * same-month periods; see lib/cycles.js and docs/backlog.md.
   *
   * @param {object} source   — validated income-source fields (month is set here)
   * @param {string} cycleId  — the target period's id
   */
  const addIncomeSource = useCallback(async (source, cycleId) => {
    if (!centreId) return { data: null, error: new Error('No active budget centre') };
    // Resolve the target period before any work. Refuse rather than insert a
    // NULL-cycle or wrong-cycle row (CYC02 invariant).
    const cycle = cycles.find(c => c.id === cycleId && !c.deleted_at);
    if (!cycle) return { data: null, error: new Error(`Unknown budget period ${cycleId} (CYC02)`) };
    const row        = { ...source, month: cycle.start_date.slice(0, 7) };   // derived, never a key
    const tempId     = crypto.randomUUID();
    const optimistic = { ...row, id: tempId, budget_centre_id: centreId, cycle_id: cycleId, received: false, received_amount: 0, _optimistic: true };
    setIncomes(prev => [...prev, optimistic]);
    // Stamp cycle_id into the DB insert too (Commit 14a) — explicit write, not trigger-resolved.
    const { data, error } = await dbAddIncomeSource(centreId, row, cycleId);
    if (error) {
      setIncomes(prev => prev.filter(i => i.id !== tempId));
      console.error('[useIncomeMutations] addIncomeSource rollback:', error.message);
      return { data: null, error };
    }
    setIncomes(prev => prev.map(i => i.id === tempId ? { ...data, _optimistic: false } : i));
    return { data, error: null };
  }, [centreId, cycles, setIncomes]);

  // Roll forward income sources from one budget PERIOD to another (Phase 2B). Copies
  // the recurring "shape" of each source (label, icon, amount, schedule) into the new
  // period as a fresh PENDING source (received=false / received_amount=0 via DB
  // defaults). One-off buckets are filtered out at this data layer too — a
  // backstop to the UI filter — so they never carry forward even if their id is
  // passed explicitly. `incomes` here is the full cross-period allIncomes list.
  //
  // Both ends are cycle ids, never months: two periods can start in the same month,
  // so a month string cannot name either end unambiguously.
  //
  // @param {string}   fromCycleId — period to copy from
  // @param {string}   toCycleId   — period to copy into
  // @param {string[]} [sourceIds] — optional subset; omit to copy ALL non-bucket
  const copyIncomeSourcesToCycle = useCallback(async (fromCycleId, toCycleId, sourceIds) => {
    if (!centreId) return { data: null, error: new Error('No active budget centre') };

    // Resolve the TARGET period first — validate the input before building rows,
    // rather than discovering it after (CYC02: never insert a NULL-cycle row).
    const toCycle = cycles.find(c => c.id === toCycleId && !c.deleted_at);
    if (!toCycle) return { data: null, error: new Error(`Unknown budget period ${toCycleId} (CYC02)`) };

    const toCopy = sliceByCycle(incomes, fromCycleId).filter(i =>
      i.notes !== ONE_OFF_MARKER &&
      !i.deleted_at &&
      (!sourceIds || sourceIds.includes(i.id))
    );
    if (toCopy.length === 0) return { data: [], error: null };   // nothing to copy — not an error

    const cycleId = toCycleId;
    const toMonth = toCycle.start_date.slice(0, 7);   // derived, never a key

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
    const optimistic = newRows.map(r => ({ ...r, id: crypto.randomUUID(), budget_centre_id: centreId, cycle_id: cycleId, received: false, received_amount: 0, _optimistic: true }));
    const tempIds    = new Set(optimistic.map(o => o.id));
    setIncomes(prev => [...prev, ...optimistic]);

    // Stamp cycle_id into the DB insert too (Commit 14a) — explicit write, not trigger-resolved.
    const { data, error } = await dbBulkAddIncomeSources(centreId, newRows, cycleId);
    if (error) {
      setIncomes(prev => prev.filter(i => !tempIds.has(i.id)));
      console.error('[useIncomeMutations] copyIncomeSourcesToCycle rollback:', error.message);
      return { data: null, error };
    }

    // Swap the whole temp block for server rows (can't map temp→server by id).
    setIncomes(prev => [...prev.filter(i => !tempIds.has(i.id)), ...(data || []).map(d => ({ ...d, _optimistic: false }))]);
    return { data: data || [], error: null };
  }, [centreId, cycles, incomes, setIncomes]);

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

  /**
   * Move an income source to another budget period — the income twin of
   * useMoveToCycle (which does this for transactions). Once cycle_id is income's
   * only period key, a mis-stamped row needs a way home that is not a DB errand.
   *
   * REFUSES A RECEIVED SOURCE, deliberately. markReceived is two-phase (CLAUDE.md
   * §11): it also inserts an income TRANSACTION, and transactions are keyed by DATE
   * CONTAINMENT, not cycle_id. Moving the source alone would leave that transaction
   * in the old period and split every downstream total along exactly the seam this
   * workstream closed. It cannot be fixed from here either: `txs` holds only the
   * VIEWED period's transactions, so a mis-stamped source's linked row is usually
   * not in local state at all and a markPending-style phase 2 would silently no-op.
   * A PENDING source provably has no linked income transaction (markPending
   * soft-deletes it), so for pending rows cycle_id + month IS the whole period
   * identity and this single write moves everything. Moving a received source needs
   * an atomic two-table RPC — backlogged, not built.
   *
   * @param {string} sourceId
   * @param {string} cycleId — the target period's id
   */
  const moveIncomeSourceToCycle = useCallback(async (sourceId, cycleId) => {
    const source = incomes.find(i => i.id === sourceId);
    if (!source) return { data: null, error: new Error('Income source not found') };
    if (source._optimistic) return { data: null, error: new Error('This income source is still saving') };
    if (source.received) {
      return { data: null, error: new Error('RECEIVED_SOURCE') };   // caller renders the un-confirm hint
    }

    // Validate the target period BEFORE any work — same guard as addIncomeSource.
    // This also blocks a cycle from ANOTHER hub, which RLS would not catch: the move
    // leaves budget_centre_id untouched, so can_view_income() passes either way.
    const cycle = cycles.find(c => c.id === cycleId && !c.deleted_at);
    if (!cycle) return { data: null, error: new Error(`Unknown budget period ${cycleId} (CYC02)`) };
    if (source.cycle_id === cycleId) return { data: source, error: null };   // no-op, not an error

    const month = cycle.start_date.slice(0, 7);   // derived, never a key
    const prev  = incomes;
    setIncomes(p => p.map(i => (i.id === sourceId ? { ...i, cycle_id: cycleId, month } : i)));

    const { data, error } = await dbMoveIncomeSourceToCycle(sourceId, cycleId, month);
    if (error) {
      setIncomes(prev);
      console.error('[useIncomeMutations] moveIncomeSourceToCycle rollback:', error.message);
      return { data: null, error };
    }

    // Swap the optimistic row for the server row when the read-back returned one.
    if (data) setIncomes(p => p.map(i => (i.id === sourceId ? { ...data, _optimistic: false } : i)));
    return { data, error: null };
  }, [incomes, cycles, setIncomes]);

  return { markReceived, markPending, updateExpectedAmount, updateIncomeSource, addIncomeSource, copyIncomeSourcesToCycle, moveIncomeSourceToCycle, deleteIncomeSource };
}
