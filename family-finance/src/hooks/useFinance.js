import { useState, useMemo, useEffect } from 'react';
import { INITIAL_TXS, INITIAL_INCOMES, GUEST_DEFAULTS } from '../data/mockData';
import { NOTIF_DEFAULTS } from '../constants';
import {
  calcTotalIncome, calcTotalSpent, calcRemaining,
  calcHealthPct, calcCategorySpend, calcWeeklyData,
  calcSpendByDay, calcTotalFixed, getBudgetStatus,
  calcTotalExpected, calcTotalReceived, calcAvailableNow,
  calcVariableSpent, calcFixedSpent, calcSurplusLeft,
  syncGuestExpenseToBackend,
} from '../lib/finance';
import { createWorkspace } from '../lib/workspaces';
import { PLAN_LIMITS } from '../constants/workspaces';
import { persist, load, KEYS } from '../lib/storage';
import { resolveTheme } from '../lib/themes';
import { DEFAULT_THEME } from '../constants/skins';
import { HOUSEHOLD } from '../data/mockData';

/** Primary workspace — always exists, uses the main family data */
const PRIMARY_WS_ID = 'ws_primary';

export function useFinance() {
  // ── Core family data ───────────────────────────────────────────────────
  const [txs,           setTxs]           = useState(INITIAL_TXS);
  const [incomes,       setIncomes]       = useState(INITIAL_INCOMES);
  const [notifs,        setNotifs]        = useState(NOTIF_DEFAULTS);

  // Load guestSettings from localStorage so portal URL works cross-tab
  const [guestSettings, setGuestSettingsState] = useState(() => {
    const saved = load(KEYS.GUEST_SETTINGS);
    if (saved) {
      console.debug('[useFinance] Loaded guestSettings from localStorage:', saved.enabled);
      return saved;
    }
    return GUEST_DEFAULTS;
  });

  // Persist guestSettings to localStorage whenever it changes
  const setGuestSettings = (updater) => {
    setGuestSettingsState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      persist(KEYS.GUEST_SETTINGS, next);
      console.debug('[useFinance] Persisted guestSettings, enabled:', next.enabled);
      return next;
    });
  };

  // ── Theme state ────────────────────────────────────────────────────────
  const [theme, setThemeState] = useState(() =>
    resolveTheme(load(KEYS.THEME))
  );

  const setTheme = (updater) => {
    setThemeState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      persist(KEYS.THEME, next);
      return next;
    });
  };

  // ── Workspace state ────────────────────────────────────────────────────
  const [workspaces,    setWorkspaces]    = useState([]);   // extra workspaces only
  const [activeWsId,    setActiveWsId]    = useState(PRIMARY_WS_ID);
  const [plan,          setPlan]          = useState('free'); // 'free' | 'premium'

  // ── Active workspace data ──────────────────────────────────────────────
  // Primary workspace uses live txs/incomes state.
  // Extra workspaces use their own embedded data.
  const isExtraWs    = activeWsId !== PRIMARY_WS_ID;
  const activeWs     = workspaces.find(w => w.id === activeWsId) || null;
  const activeTxs    = isExtraWs ? (activeWs?.txs    || []) : txs;
  const activeIncomes = isExtraWs ? (activeWs?.incomes || []) : incomes;

  // ── Transaction derived values ─────────────────────────────────────────
  const totalIncome  = useMemo(() => calcTotalIncome(activeTxs),  [activeTxs]);
  const totalSpent   = useMemo(() => calcTotalSpent(activeTxs),   [activeTxs]);
  const totalFixed   = useMemo(() => calcTotalFixed(),              []);
  const monthlyIncome = isExtraWs ? (activeWs?.monthlyBudget || 0) : HOUSEHOLD.monthlyIncome;
  const remaining    = useMemo(() => calcRemaining(monthlyIncome, totalSpent), [monthlyIncome, totalSpent]);
  const healthPct    = useMemo(() => calcHealthPct(remaining, monthlyIncome),  [remaining, monthlyIncome]);
  const budgetStatus = useMemo(() => getBudgetStatus(remaining, HOUSEHOLD.surplusTarget), [remaining]);
  const catSpend     = useMemo(() => calcCategorySpend(activeTxs), [activeTxs]);
  const weeklyData   = useMemo(() => calcWeeklyData(activeTxs),    [activeTxs]);
  const spendByDay   = useMemo(() => calcSpendByDay(activeTxs),    [activeTxs]);
  const variableSpent = useMemo(() => calcVariableSpent(activeTxs), [activeTxs]);
  const fixedSpent    = useMemo(() => calcFixedSpent(activeTxs),    [activeTxs]);
  const surplusLeft   = useMemo(() => calcSurplusLeft(monthlyIncome, totalFixed, variableSpent), [monthlyIncome, totalFixed, variableSpent]);

  // ── Payday derived values ──────────────────────────────────────────────
  const totalExpected = useMemo(() => calcTotalExpected(activeIncomes),          [activeIncomes]);
  const totalReceived = useMemo(() => calcTotalReceived(activeIncomes),          [activeIncomes]);
  const availableNow  = useMemo(() => calcAvailableNow(activeIncomes, activeTxs),[activeIncomes, activeTxs]);
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

  const addTransaction = (tx) => {
    const newTx = { ...tx, id: Date.now() };
    if (isExtraWs) {
      setWorkspaces(prev => prev.map(w =>
        w.id === activeWsId ? { ...w, txs: [newTx, ...(w.txs || [])] } : w
      ));
    } else {
      setTxs(prev => [newTx, ...prev]);
      // GOOGLE SHEETS SYNC POINT: await sheetsService.appendRow(newTx);
      // FIREBASE SYNC POINT: await addDoc(collection(db, 'families', familyId, 'transactions'), newTx);
      if (newTx.source === 'guest_portal') {
        syncGuestExpenseToBackend(newTx); // MVP stub — replace with real backend call
      }
    }
  };

  const markReceived = (id, receivedAmount, actualPayDate) => {
    const updater = prev => prev.map(i =>
      i.id === id ? { ...i, received: true, receivedAmount, actualPayDate } : i
    );
    if (isExtraWs) {
      setWorkspaces(prev => prev.map(w =>
        w.id === activeWsId ? { ...w, incomes: updater(w.incomes || []) } : w
      ));
    } else {
      setIncomes(updater);
    }
  };

  const markPending = (id) => {
    const updater = prev => prev.map(i =>
      i.id === id ? { ...i, received: false, receivedAmount: 0, actualPayDate: null } : i
    );
    if (isExtraWs) {
      setWorkspaces(prev => prev.map(w =>
        w.id === activeWsId ? { ...w, incomes: updater(w.incomes || []) } : w
      ));
    } else {
      setIncomes(updater);
    }
  };

  // ── Workspace handlers ─────────────────────────────────────────────────

  const canAddWorkspace = plan === 'premium'
    ? workspaces.length < PLAN_LIMITS.premium.workspaces - 1
    : workspaces.length < PLAN_LIMITS.free.workspaces - 1;

  const addWorkspace = (opts) => {
    if (!canAddWorkspace) return false;
    const ws = createWorkspace(opts);
    setWorkspaces(prev => [...prev, ws]);
    setActiveWsId(ws.id);
    return true;
  };

  const switchWorkspace = (id) => setActiveWsId(id);

  const deleteWorkspace = (id) => {
    if (id === PRIMARY_WS_ID) return;
    setWorkspaces(prev => prev.filter(w => w.id !== id));
    if (activeWsId === id) setActiveWsId(PRIMARY_WS_ID);
  };

  // ── All workspaces list (primary + extras) for the panel ───────────────
  const allWorkspaces = useMemo(() => [
    {
      id:            PRIMARY_WS_ID,
      name:          HOUSEHOLD.name,
      typeId:        'home',
      currency:      HOUSEHOLD.currency,
      monthlyBudget: HOUSEHOLD.monthlyIncome,
      txs,
      incomes,
    },
    ...workspaces,
  ], [workspaces, txs, incomes]);

  return {
    // Active workspace data
    txs: activeTxs, totalIncome, totalSpent, totalFixed,
    remaining, healthPct, budgetStatus, monthlyIncome,
    catSpend, weeklyData, spendByDay,
    variableSpent, fixedSpent, surplusLeft,
    addTransaction,
    incomes: activeIncomes, totalExpected, totalReceived, availableNow, nextUnpaid,
    markReceived, markPending,
    notifs, setNotifs,
    guestSettings, setGuestSettings,
    theme, setTheme,
    // Workspace
    allWorkspaces, activeWsId, activeWs, isExtraWs,
    plan, setPlan,
    canAddWorkspace, addWorkspace, switchWorkspace, deleteWorkspace,
  };
}
