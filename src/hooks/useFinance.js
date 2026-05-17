import { useState, useMemo } from 'react';
import { INITIAL_TXS, INITIAL_INCOMES, GUEST_DEFAULTS, HOUSEHOLD } from '../data/mockData';
import { NOTIF_DEFAULTS } from '../constants';
import {
  calcTotalIncome, calcTotalSpent, calcRemaining,
  calcHealthPct, calcCategorySpend, calcWeeklyData,
  calcSpendByDay, calcTotalFixed, getBudgetStatus,
  calcTotalExpected, calcTotalReceived, calcAvailableNow,
  calcVariableSpent, calcFixedSpent, calcSurplusLeft,
  syncGuestExpenseToBackend, syncExpectedIncomeToSpreadsheet,
} from '../lib/finance';
import { createWorkspace } from '../lib/workspaces';
import { PLAN_LIMITS } from '../constants/workspaces';
import { persist, load, KEYS } from '../lib/storage';
import { resolveTheme } from '../lib/themes';
import { DEFAULT_THEME } from '../constants/skins';

const PRIMARY_WS_ID = 'ws_primary';

export function useFinance() {
  const [txs,     setTxs]     = useState(INITIAL_TXS);
  const [incomes, setIncomes] = useState(INITIAL_INCOMES);
  const [notifs,  setNotifs]  = useState(NOTIF_DEFAULTS);

  const [guestSettings, setGuestSettingsState] = useState(() => {
    const saved = load(KEYS.GUEST_SETTINGS);
    return saved || GUEST_DEFAULTS;
  });

  const setGuestSettings = (updater) => {
    setGuestSettingsState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      persist(KEYS.GUEST_SETTINGS, next);
      return next;
    });
  };

  const [theme, setThemeState] = useState(() => resolveTheme(load(KEYS.THEME)));

  const setTheme = (updater) => {
    setThemeState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      persist(KEYS.THEME, next);
      return next;
    });
  };

  const [workspaces, setWorkspaces] = useState([]);
  const [activeWsId, setActiveWsId] = useState(PRIMARY_WS_ID);
  const [plan,       setPlan]       = useState('free');

  const isExtraWs     = activeWsId !== PRIMARY_WS_ID;
  const activeWs      = workspaces.find(w => w.id === activeWsId) || null;
  const activeTxs     = isExtraWs ? (activeWs?.txs     || []) : txs;
  const activeIncomes = isExtraWs ? (activeWs?.incomes  || []) : incomes;

  const totalIncome   = useMemo(() => calcTotalIncome(activeTxs),   [activeTxs]);
  const totalSpent    = useMemo(() => calcTotalSpent(activeTxs),    [activeTxs]);
  const totalFixed    = useMemo(() => calcTotalFixed(),               []);
  const monthlyIncome = isExtraWs ? (activeWs?.monthlyBudget || 0) : HOUSEHOLD.monthlyIncome;
  const remaining     = useMemo(() => calcRemaining(monthlyIncome, totalSpent),    [monthlyIncome, totalSpent]);
  const healthPct     = useMemo(() => calcHealthPct(remaining, monthlyIncome),     [remaining, monthlyIncome]);
  const budgetStatus  = useMemo(() => getBudgetStatus(remaining, HOUSEHOLD.surplusTarget), [remaining]);
  const catSpend      = useMemo(() => calcCategorySpend(activeTxs),  [activeTxs]);
  const weeklyData    = useMemo(() => calcWeeklyData(activeTxs),     [activeTxs]);
  const spendByDay    = useMemo(() => calcSpendByDay(activeTxs),     [activeTxs]);
  const variableSpent = useMemo(() => calcVariableSpent(activeTxs),  [activeTxs]);
  const fixedSpent    = useMemo(() => calcFixedSpent(activeTxs),     [activeTxs]);
  const surplusLeft   = useMemo(() => calcSurplusLeft(monthlyIncome, totalFixed, variableSpent), [monthlyIncome, totalFixed, variableSpent]);

  const totalExpected = useMemo(() => calcTotalExpected(activeIncomes),           [activeIncomes]);
  const totalReceived = useMemo(() => calcTotalReceived(activeIncomes),           [activeIncomes]);
  const availableNow  = useMemo(() => calcAvailableNow(activeIncomes, activeTxs), [activeIncomes, activeTxs]);
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

  // ── Handlers ───────────────────────────────────────────────────────────

  const applyIncomeUpdater = (updater) => {
    if (isExtraWs) {
      setWorkspaces(prev => prev.map(w =>
        w.id === activeWsId ? { ...w, incomes: updater(w.incomes || []) } : w
      ));
    } else {
      setIncomes(updater);
    }
  };

  const addTransaction = (tx) => {
    const newTx = { ...tx, id: Date.now() };
    if (isExtraWs) {
      setWorkspaces(prev => prev.map(w =>
        w.id === activeWsId ? { ...w, txs: [newTx, ...(w.txs || [])] } : w
      ));
    } else {
      setTxs(prev => [newTx, ...prev]);
      // GOOGLE SHEETS SYNC POINT: await sheetsService.appendRow(newTx);
      // SUPABASE SYNC POINT: await supabase.from('transactions').insert(newTx);
      if (newTx.source === 'guest_portal') syncGuestExpenseToBackend(newTx);
    }
  };

  const markReceived = (id, receivedAmount, actualPayDate) =>
    applyIncomeUpdater(prev => prev.map(i =>
      i.id === id ? { ...i, received: true, receivedAmount, actualPayDate } : i
    ));

  const markPending = (id) =>
    applyIncomeUpdater(prev => prev.map(i =>
      i.id === id ? { ...i, received: false, receivedAmount: 0, actualPayDate: null } : i
    ));

  const updateExpectedAmount = (id, newAmount) => {
    applyIncomeUpdater(prev => prev.map(i =>
      i.id === id ? { ...i, expectedAmount: newAmount } : i
    ));
    // GOOGLE SHEETS SYNC POINT:
    syncExpectedIncomeToSpreadsheet(id, newAmount);
  };

  // ── Workspace handlers ─────────────────────────────────────────────────

  const canAddWorkspace = plan === 'premium'
    ? workspaces.length < PLAN_LIMITS.premium.workspaces - 1
    : workspaces.length < PLAN_LIMITS.free.workspaces - 1;

  const addWorkspace = (opts) => {
    if (!canAddWorkspace) return false;
    const ws = createWorkspace(opts, { monthlyIncome: HOUSEHOLD.monthlyIncome, incomes });
    setWorkspaces(prev => [...prev, ws]);
    setActiveWsId(ws.id);
    return true;
  };

  const switchWorkspace = (id) => setActiveWsId(id);

  const deleteWorkspace = (id) => {
    setWorkspaces(prev => prev.filter(w => w.id !== id));
    if (activeWsId === id) setActiveWsId(PRIMARY_WS_ID);
  };

  return {
    txs: activeTxs, totalIncome, totalSpent, totalFixed,
    remaining, healthPct, budgetStatus, monthlyIncome,
    catSpend, weeklyData, spendByDay,
    variableSpent, fixedSpent, surplusLeft,
    addTransaction,
    incomes: activeIncomes, totalExpected, totalReceived, availableNow, nextUnpaid,
    markReceived, markPending, updateExpectedAmount,
    notifs, setNotifs,
    guestSettings, setGuestSettings,
    theme, setTheme,
    allWorkspaces: workspaces, activeWsId, activeWs, isExtraWs,
    plan, setPlan,
    canAddWorkspace, addWorkspace, switchWorkspace, deleteWorkspace,
  };
}
