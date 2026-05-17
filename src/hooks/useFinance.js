import { useState, useMemo, useEffect, useCallback } from 'react';
import { INITIAL_TXS, INITIAL_INCOMES, GUEST_DEFAULTS, HOUSEHOLD } from '../data/mockData';
import { NOTIF_DEFAULTS } from '../constants';
import {
  calcTotalIncome, calcTotalSpent, calcRemaining,
  calcHealthPct, calcCategorySpend, calcWeeklyData,
  calcSpendByDay, calcTotalFixed, getBudgetStatus,
  calcTotalExpected, calcTotalReceived, calcAvailableNow,
  calcVariableSpent, calcFixedSpent, calcSurplusLeft,
  syncGuestExpenseToBackend, syncExpectedIncomeToSpreadsheet,
  getWeekForDate,
} from '../lib/finance';
import { createWorkspace } from '../lib/workspaces';
import { PLAN_LIMITS } from '../constants/workspaces';
import { persist, load, remove, KEYS } from '../lib/storage';
import { resolveTheme } from '../lib/themes';
import {
  getTransactions,
  addTransaction as dbAddTransaction,
  deleteTransaction as dbDeleteTransaction,
} from '../services/transactions.service';
import {
  getIncomeSources,
  markIncomeReceived as dbMarkReceived,
  markIncomePending  as dbMarkPending,
  updateExpectedAmount as dbUpdateExpected,
} from '../services/incomes.service';

const PRIMARY_WS_ID = 'ws_primary';

// ── Data shape mappers ────────────────────────────────────────────────────────

const mapTransaction = (row) => ({
  id:          row.id,
  date:        row.date,
  week:        row.week,
  type:        row.type === 'income' ? 'Income' : 'Expense',
  category:    row.category_name,
  categoryId:  row.category_id  || null,
  description: row.description  || '',
  amount:      Number(row.amount),
  submittedBy: row.submitted_by || null,
  source:      row.source       || 'main_app',
  createdAt:   row.created_at,
});

const mapIncome = (row) => ({
  id:             row.id,
  source:         row.label,
  expectedAmount: Number(row.expected_amount),
  expectedPayDay: row.pay_day        || null,
  payDayType:     row.pay_day_type,
  icon:           row.icon           || '👤',
  notes:          row.notes          || '',
  received:       row.received,
  receivedAmount: Number(row.received_amount || 0),
  actualPayDate:  row.actual_pay_date || null,
});

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useFinance(householdId = null) {
  const hasHousehold = Boolean(householdId);

  const [txs,    setTxsState] = useState(() =>
    hasHousehold ? [] : (load(KEYS.TRANSACTIONS) || INITIAL_TXS)
  );
  const [incomes, setIncomes] = useState(hasHousehold ? [] : INITIAL_INCOMES);
  const [dbReady, setDbReady] = useState(!hasHousehold);
  const [notifs,  setNotifs]  = useState(NOTIF_DEFAULTS);

  const setTxs = useCallback((updater) => {
    setTxsState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (!hasHousehold) persist(KEYS.TRANSACTIONS, next);
      return next;
    });
  }, [hasHousehold]);

  // ── Supabase data loading ─────────────────────────────────────────────
  useEffect(() => {
    if (!householdId) return;
    let cancelled = false;

    const loadData = async () => {
      setDbReady(false);
      // Clear stale localStorage transactions to prevent flash of old data
      remove(KEYS.TRANSACTIONS);

      const [txResult, incomeResult] = await Promise.all([
        getTransactions(householdId),
        getIncomeSources(householdId),
      ]);

      if (cancelled) return;
      if (txResult.data)     setTxsState(txResult.data.map(mapTransaction));
      if (incomeResult.data) setIncomes(incomeResult.data.map(mapIncome));
      setDbReady(true);
    };

    loadData();
    return () => { cancelled = true; };
  }, [householdId]);

  // ── Theme + guest settings ────────────────────────────────────────────
  const [guestSettings, setGuestSettingsState] = useState(
    () => load(KEYS.GUEST_SETTINGS) || GUEST_DEFAULTS
  );
  const setGuestSettings = useCallback((updater) => {
    setGuestSettingsState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      persist(KEYS.GUEST_SETTINGS, next);
      return next;
    });
  }, []);

  const [theme, setThemeState] = useState(() => resolveTheme(load(KEYS.THEME)));
  const setTheme = useCallback((updater) => {
    setThemeState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      persist(KEYS.THEME, next);
      return next;
    });
  }, []);

  // ── Workspace state ───────────────────────────────────────────────────
  const [extraWorkspaces, setExtraWorkspaces] = useState([]);
  const [activeWsId,      setActiveWsId]      = useState(PRIMARY_WS_ID);
  const [plan,            setPlan]            = useState('free');

  const isExtraWs     = activeWsId !== PRIMARY_WS_ID;
  const activeWs      = extraWorkspaces.find(w => w.id === activeWsId) || null;
  const activeTxs     = isExtraWs ? (activeWs?.txs    || []) : txs;
  const activeIncomes = isExtraWs ? (activeWs?.incomes || []) : incomes;

  // ── Derived values ────────────────────────────────────────────────────
  const monthlyIncome = isExtraWs ? (activeWs?.monthlyBudget || 0) : HOUSEHOLD.monthlyIncome;
  const totalIncome   = useMemo(() => calcTotalIncome(activeTxs),   [activeTxs]);
  const totalSpent    = useMemo(() => calcTotalSpent(activeTxs),    [activeTxs]);
  const totalFixed    = useMemo(() => calcTotalFixed(),               []);
  const remaining     = useMemo(() => calcRemaining(monthlyIncome, totalSpent),    [monthlyIncome, totalSpent]);
  const healthPct     = useMemo(() => calcHealthPct(remaining, monthlyIncome),     [remaining, monthlyIncome]);
  const budgetStatus  = useMemo(() => getBudgetStatus(remaining, HOUSEHOLD.surplusTarget), [remaining]);
  const catSpend      = useMemo(() => calcCategorySpend(activeTxs),  [activeTxs]);
  const weeklyData    = useMemo(() => calcWeeklyData(activeTxs),     [activeTxs]);
  const spendByDay    = useMemo(() => calcSpendByDay(activeTxs),     [activeTxs]);
  const variableSpent = useMemo(() => calcVariableSpent(activeTxs),  [activeTxs]);
  const fixedSpent    = useMemo(() => calcFixedSpent(activeTxs),     [activeTxs]);
  const surplusLeft   = useMemo(() => calcSurplusLeft(monthlyIncome, totalFixed, variableSpent), [monthlyIncome, totalFixed, variableSpent]);
  const totalExpected = useMemo(() => calcTotalExpected(activeIncomes),            [activeIncomes]);
  const totalReceived = useMemo(() => calcTotalReceived(activeIncomes),            [activeIncomes]);
  const availableNow  = useMemo(() => calcAvailableNow(activeIncomes, activeTxs),  [activeIncomes, activeTxs]);
  const nextUnpaid    = useMemo(() => {
    const today = new Date();
    return activeIncomes
      .filter(i => !i.received && i.expectedPayDay)
      .sort((a, b) => {
        const dA = ((a.expectedPayDay - today.getDate()) + 31) % 31;
        const dB = ((b.expectedPayDay - today.getDate()) + 31) % 31;
        return dA - dB;
      })[0] || null;
  }, [activeIncomes]);

  // ── Primary workspace object ──────────────────────────────────────────
  const primaryWorkspace = useMemo(() => ({
    id:            PRIMARY_WS_ID,
    name:          HOUSEHOLD.name,
    typeId:        'home',
    currency:      HOUSEHOLD.currency || 'GHS',
    monthlyBudget: monthlyIncome,
    txs:           txs,
    incomes:       incomes,
  }), [monthlyIncome, txs, incomes]);

  const allWorkspaces = useMemo(() =>
    [primaryWorkspace, ...extraWorkspaces],
    [primaryWorkspace, extraWorkspaces]
  );

  // ── Handlers ──────────────────────────────────────────────────────────

  const applyIncomeUpdater = useCallback((updater) => {
    if (isExtraWs) {
      setExtraWorkspaces(prev => prev.map(w =>
        w.id === activeWsId ? { ...w, incomes: updater(w.incomes || []) } : w
      ));
    } else {
      setIncomes(updater);
    }
  }, [isExtraWs, activeWsId]);

  const addTransaction = useCallback(async (tx) => {
    const tempId = Date.now();
    const newTx  = { ...tx, id: tempId };

    if (isExtraWs) {
      setExtraWorkspaces(prev => prev.map(w =>
        w.id === activeWsId ? { ...w, txs: [newTx, ...(w.txs || [])] } : w
      ));
      return;
    }

    setTxs(prev => [newTx, ...prev]);

    if (householdId) {
      const { data, error } = await dbAddTransaction(householdId, {
        date:          tx.date,
        week:          tx.week,
        type:          tx.type === 'Income' ? 'income' : 'expense',
        category_name: tx.category,
        category_id:   tx.categoryId || null,
        description:   tx.description || '',
        amount:        tx.amount,
        submitted_by:  tx.submittedBy || null,
        source:        tx.source || 'main_app',
      });
      if (!error && data) {
        setTxs(prev => prev.map(t => t.id === tempId ? { ...newTx, id: data.id } : t));
      }
    }

    if (newTx.source === 'guest_portal') syncGuestExpenseToBackend(newTx);
  }, [householdId, isExtraWs, activeWsId, setTxs]);

  const markReceived = useCallback(async (id, receivedAmount, actualPayDate) => {
    // Update income source state
    applyIncomeUpdater(prev => prev.map(i =>
      i.id === id ? { ...i, received: true, receivedAmount, actualPayDate } : i
    ));

    // Find the income source to get its label
    const income = incomes.find(i => i.id === id);
    const label  = income?.source || 'Salary';

    // Create an Income transaction so dashboard totalIncome reflects it
    const today = actualPayDate || new Date().toISOString().split('T')[0];
    await addTransaction({
      date:        today,
      week:        getWeekForDate(today),
      type:        'Income',
      category:    label,
      description: label + ' received',
      amount:      receivedAmount,
      source:      'main_app',
    });

    // SUPABASE SYNC POINT:
    if (householdId) await dbMarkReceived(id, receivedAmount, actualPayDate);
  }, [householdId, applyIncomeUpdater, addTransaction, incomes]);

  const markPending = useCallback(async (id) => {
    // Find the income source before resetting it
    const income = incomes.find(i => i.id === id);

    // Remove the income transaction that was created when marked received
    if (income?.source) {
      setTxs(prev => prev.filter(t =>
        !(t.type === 'Income' && t.category === income.source && t.source === 'main_app')
      ));
      // SUPABASE SYNC POINT: delete matching income transaction
    }

    applyIncomeUpdater(prev => prev.map(i =>
      i.id === id ? { ...i, received: false, receivedAmount: 0, actualPayDate: null } : i
    ));

    if (householdId) await dbMarkPending(id);
  }, [householdId, applyIncomeUpdater, incomes, setTxs]);

  const updateExpectedAmount = useCallback(async (id, newAmount) => {
    applyIncomeUpdater(prev => prev.map(i =>
      i.id === id ? { ...i, expectedAmount: newAmount } : i
    ));
    if (householdId) await dbUpdateExpected(id, newAmount);
    syncExpectedIncomeToSpreadsheet(id, newAmount);
  }, [householdId, applyIncomeUpdater]);

  // ── Workspace handlers ────────────────────────────────────────────────
  const totalWsCount    = 1 + extraWorkspaces.length;
  const canAddWorkspace = plan === 'premium'
    ? totalWsCount < PLAN_LIMITS.premium.workspaces
    : totalWsCount < PLAN_LIMITS.free.workspaces;

  const addWorkspace = (opts) => {
    if (!canAddWorkspace) return false;
    const ws = createWorkspace(opts, { monthlyIncome: HOUSEHOLD.monthlyIncome, incomes });
    setExtraWorkspaces(prev => [...prev, ws]);
    setActiveWsId(ws.id);
    return true;
  };
  const switchWorkspace = (id) => setActiveWsId(id);
  const deleteWorkspace = (id) => {
    setExtraWorkspaces(prev => prev.filter(w => w.id !== id));
    if (activeWsId === id) setActiveWsId(PRIMARY_WS_ID);
  };

  return {
    txs: activeTxs, totalIncome, totalSpent, totalFixed,
    remaining, healthPct, budgetStatus, monthlyIncome,
    catSpend, weeklyData, spendByDay,
    variableSpent, fixedSpent, surplusLeft, dbReady,
    addTransaction,
    incomes: activeIncomes, totalExpected, totalReceived, availableNow, nextUnpaid,
    markReceived, markPending, updateExpectedAmount,
    notifs, setNotifs,
    guestSettings, setGuestSettings,
    theme, setTheme,
    allWorkspaces, activeWsId, activeWs, isExtraWs,
    plan, setPlan,
    canAddWorkspace, addWorkspace, switchWorkspace, deleteWorkspace,
  };
}
