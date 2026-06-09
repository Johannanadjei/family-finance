import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useFinance } from './useFinance';
vi.mock('../lib/auth', () => ({ waitForSession: vi.fn().mockResolvedValue({ data: { session: { expires_at: 9999999999 } }, error: null }), warnOnEmptyColdLoad: vi.fn(), sessionAgeMs: vi.fn(() => 0) }));
vi.mock('../services/transactions.service', () => ({ getTransactionsByCycle: vi.fn(), addTransaction: vi.fn(), updateTransaction: vi.fn(), deleteTransaction: vi.fn(), moveTransactionToCycle: vi.fn() }));
vi.mock('../services/income.service', () => ({ getIncomeSources: vi.fn(), markReceived: vi.fn(), markPending: vi.fn(), updateExpectedAmount: vi.fn() }));
vi.mock('../services/cycles.service', () => ({
  getCyclesForCentre: vi.fn().mockResolvedValue({ data: [], error: null }),
  createBudgetPeriod: vi.fn().mockResolvedValue({ data: { id: 'cyc-new' }, error: null }),
  resetBudgetPeriod: vi.fn().mockResolvedValue({ data: { categories_reset: 0, transactions_reset: 0, cycle_id: 'cyc-cur' }, error: null }),
}));
vi.mock('../lib/storage', () => ({ loadPrefs: () => ({ themeSkin: 'family_warmth' }), saveThemeSkin: vi.fn(), saveThemeAccent: vi.fn(), saveNotifications: vi.fn() }));
import { getTransactionsByCycle } from '../services/transactions.service';
import { getIncomeSources } from '../services/income.service';
import { getCyclesForCentre, createBudgetPeriod, resetBudgetPeriod } from '../services/cycles.service';
import { getCurrentMonth, getToday } from '../lib/dates';
import { calcTotalFixed } from '../lib/finance';
const C = { id:'centre-1', currency:'GHS', surplus_target:4500 };
const M = getCurrentMonth();
// Income + categories slice by cycle_id (Commit 11.5), not month. CATS carry the
// current cycle's id so they land in the `categories` slice useFinance now derives.
const CATS = [{ id:'cat-1', name:'Groceries', icon:'🛒', budget_amount:500, is_fixed:true, month:M, cycle_id:'cyc-cur' },{ id:'cat-2', name:'Transport', icon:'🚗', budget_amount:200, is_fixed:true, month:M, cycle_id:'cyc-cur' }];
// Transactions read by cycle_id (Commit 11) via a gated loader — load() only fires
// once a current cycle resolves. Tests that expect a fetch must seed this cycle.
const CUR_CYCLE = { id:'cyc-cur', budget_centre_id:'centre-1', name:'Current', start_date: M+'-01', end_date: M+'-31', anchor_type:'calendar', deleted_at:null };
const INC = [{ id:'inc-1', label:'Adjei Salary', expected_amount:30000, received:true, received_amount:30000, pay_day:31, pay_day_type:'last_working_day', currency:'GHS', month:M, cycle_id:'cyc-cur' },{ id:'inc-2', label:'Dita Salary', expected_amount:15000, received:false, received_amount:0, pay_day:25, pay_day_type:'fixed_date', currency:'GHS', month:M, cycle_id:'cyc-cur' }];
const TXS = [{ id:'tx-1', type:'expense', amount:200, category_name:'Groceries', date:'2026-05-19', week:'Week 3', currency:'GHS', source:'main_app', _optimistic:false },{ id:'tx-2', type:'income', amount:30000, category_name:'Adjei Salary', date:'2026-05-19', week:'Week 3', currency:'GHS', source:'main_app', _optimistic:false }];
const go = (txs=TXS, inc=INC) => { getTransactionsByCycle.mockResolvedValue({data:txs,error:null}); getIncomeSources.mockResolvedValue({data:inc,error:null}); getCyclesForCentre.mockResolvedValue({data:[CUR_CYCLE],error:null}); return renderHook(()=>useFinance({centre:C,allCategories:CATS})); };
describe('useFinance — derived values', () => {
  beforeEach(()=>{ vi.clearAllMocks(); });
  it('loads txs and incomes on mount', async()=>{ const{result}=go(); await waitFor(()=>expect(result.current.loading).toBe(false)); expect(result.current.txs).toHaveLength(2); expect(result.current.incomes).toHaveLength(2); });
  it('totalReceived = sum of received_amount', async()=>{ const{result}=go(); await waitFor(()=>expect(result.current.loading).toBe(false)); expect(result.current.totalReceived).toBe(30000); });
  it('totalSpent = sum of all expense txs', async()=>{ const{result}=go(); await waitFor(()=>expect(result.current.loading).toBe(false)); expect(result.current.totalSpent).toBe(200); });

  it('monthlyIncome = sum of expected amounts', async()=>{ const{result}=go(); await waitFor(()=>expect(result.current.loading).toBe(false)); expect(result.current.monthlyIncome).toBe(45000); });
  it('totalPending = totalExpected minus totalReceived', async()=>{ const{result}=go(); await waitFor(()=>expect(result.current.loading).toBe(false)); expect(result.current.totalPending).toBe(15000); });
  it('allIncome = totalIncome — all income transactions including salary confirmations', async()=>{ const{result}=go(); await waitFor(()=>expect(result.current.loading).toBe(false)); expect(result.current.allIncome).toBe(30000); });
  it('spareMoney = allIncome − max(fixedTotal, budgetSpend) − spareSpend', async()=>{ const{result}=go(); await waitFor(()=>expect(result.current.loading).toBe(false)); expect(result.current.spareMoney).toBe(29300); });
  it('spareMoney decreases by overspend when budgetSpend exceeds fixedTotal', async()=>{ const extra=[...TXS,{id:'tx-3',type:'expense',amount:1000,category_name:'Other',date:'2026-05-20',week:'Week 3',currency:'GHS',source:'main_app',_optimistic:false}]; const{result}=go(extra); await waitFor(()=>expect(result.current.loading).toBe(false)); expect(result.current.spareMoney).toBe(28800); });
  it('spareMoney decreases when known-category expense pushes spent above budget', async()=>{ const extra=[...TXS,{id:'tx-3',type:'expense',amount:1000,category_name:'Groceries',date:'2026-05-20',week:'Week 3',currency:'GHS',source:'main_app',_optimistic:false}]; const{result}=go(extra); await waitFor(()=>expect(result.current.loading).toBe(false)); expect(result.current.spareMoney).toBe(28800); });
  it('budgetRemaining = max(0, fixedTotal − budgetSpend), floored at 0 when overspent', async()=>{ const extra=[...TXS,{id:'tx-3',type:'expense',amount:1000,category_name:'Other',date:'2026-05-20',week:'Week 3',currency:'GHS',source:'main_app',_optimistic:false}]; const{result}=go(extra); await waitFor(()=>expect(result.current.loading).toBe(false)); expect(result.current.budgetRemaining).toBe(0); });
  it('from_spare:true tx draws from spare, leaves budget untouched', async()=>{ const extra=[...TXS,{id:'tx-3',type:'expense',amount:1000,category_name:'Groceries',date:'2026-05-20',week:'Week 3',currency:'GHS',source:'main_app',from_spare:true,_optimistic:false}]; const{result}=go(extra); await waitFor(()=>expect(result.current.loading).toBe(false)); expect(result.current.budgetSpend).toBe(200); expect(result.current.spareSpend).toBe(1000); expect(result.current.spareMoney).toBe(28300); expect(result.current.budgetRemaining).toBe(500); });
  it('from_spare:true tx does not affect Budget Health numerator', async()=>{ const extra=[...TXS,{id:'tx-3',type:'expense',amount:5000,category_name:'Groceries',date:'2026-05-20',week:'Week 3',currency:'GHS',source:'main_app',from_spare:true,_optimistic:false}]; const{result}=go(extra); await waitFor(()=>expect(result.current.loading).toBe(false)); expect(result.current.healthPct).toBe(Math.round((200/700)*100)); });
  it('mixed from_spare flags partition correctly', async()=>{ const extra=[...TXS,{id:'tx-3',type:'expense',amount:300,category_name:'Other',date:'2026-05-20',week:'Week 3',currency:'GHS',source:'main_app',from_spare:false,_optimistic:false},{id:'tx-4',type:'expense',amount:400,category_name:'Other',date:'2026-05-20',week:'Week 3',currency:'GHS',source:'main_app',from_spare:true,_optimistic:false}]; const{result}=go(extra); await waitFor(()=>expect(result.current.loading).toBe(false)); expect(result.current.budgetSpend).toBe(500); expect(result.current.spareSpend).toBe(400); });
  it('nextUnpaid returns first unpaid income', async()=>{ const{result}=go(); await waitFor(()=>expect(result.current.loading).toBe(false)); expect(result.current.nextUnpaid.label).toBe('Dita Salary'); });
  it('returns empty arrays when no centreId', async()=>{ getTransactionsByCycle.mockResolvedValue({data:[],error:null}); getIncomeSources.mockResolvedValue({data:[],error:null}); const{result}=renderHook(()=>useFinance({centre:null,allCategories:[]})); await waitFor(()=>expect(result.current.loading).toBe(false)); expect(result.current.txs).toEqual([]); });
  it('sets error when tx load fails', async()=>{ getTransactionsByCycle.mockResolvedValue({data:[],error:{message:'DB error'}}); getIncomeSources.mockResolvedValue({data:[],error:null}); getCyclesForCentre.mockResolvedValue({data:[CUR_CYCLE],error:null}); const{result}=renderHook(()=>useFinance({centre:C,allCategories:CATS})); await waitFor(()=>expect(result.current.error).toBe('DB error')); });

  // Commit 11.5 — `incomes` is the viewed-CYCLE slice (cycle_id), not month. Rows
  // from other cycles stay in allIncomes but are excluded from the slice + totals.
  it('incomes scopes to the viewed cycle while allIncomes keeps every cycle', async () => {
    const mixed = [
      { id:'cur-1', label:'This Cycle Salary', expected_amount:30000, received:true, received_amount:30000, pay_day:25, pay_day_type:'fixed_date', currency:'GHS', month:M,         cycle_id:'cyc-cur' },
      { id:'old-1', label:'Last Cycle Salary', expected_amount:20000, received:true, received_amount:20000, pay_day:25, pay_day_type:'fixed_date', currency:'GHS', month:'2020-01', cycle_id:'cyc-2020' },
      { id:'old-2', label:'Older Other',        expected_amount:5000,  received:false, received_amount:0,    pay_day:null, pay_day_type:'flexible',  currency:'GHS', month:'2019-12', cycle_id:'cyc-2019' },
    ];
    const { result } = go(TXS, mixed);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.allIncomes).toHaveLength(3);                 // every cycle retained
    expect(result.current.incomes).toHaveLength(1);                    // only the viewed cycle
    expect(result.current.incomes[0].id).toBe('cur-1');
    expect(result.current.totalReceived).toBe(30000);                  // not 50000 — other cycles excluded
  });

  // Commit 11.5 — categories slice moved here from useBudgetCentre, keyed on the
  // viewed cycle (was clock-derived month — the Commit-8 bug).
  it('categories scopes to the viewed cycle', async () => {
    const mixed = [
      ...CATS,                                                                                   // cyc-cur
      { id:'cat-old', name:'Old', icon:'📦', budget_amount:99, is_fixed:true, month:'2020-01', cycle_id:'cyc-2020' },
    ];
    getTransactionsByCycle.mockResolvedValue({ data: TXS, error: null });
    getIncomeSources.mockResolvedValue({ data: INC, error: null });
    getCyclesForCentre.mockResolvedValue({ data: [CUR_CYCLE], error: null });
    const { result } = renderHook(() => useFinance({ centre: C, allCategories: mixed }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.categories.map(c => c.id)).toEqual(['cat-1', 'cat-2']);  // only the viewed cycle
  });

  // Regression (Decision 7) — for the current cycle, the new cycle_id predicate
  // returns the SAME rows as the old month predicate, so HomeView totals don't shift
  // after deploy. cycle_id was stamped from month (Commit-10 backfill), so they agree.
  it('current-cycle slice has parity with the old month predicate (fixedTotal unchanged)', async () => {
    const { result } = go();   // CATS: month M + cycle_id cyc-cur, both name the current cycle
    await waitFor(() => expect(result.current.loading).toBe(false));
    const oldPredicate = CATS.filter(c => c.month === getCurrentMonth());
    expect(result.current.categories.map(c => c.id)).toEqual(oldPredicate.map(c => c.id));
    expect(result.current.categories).toHaveLength(oldPredicate.length);
    expect(result.current.fixedTotal).toBe(calcTotalFixed(oldPredicate));   // 700, identical both ways
  });
});

// ── Cycles (Budget Cycles, Commit 4) ──────────────────────────────────────────
// Runs after the derived-values describe, so its per-test getCyclesForCentre
// overrides never leak backwards into those (which use the factory default []).
describe('useFinance — cycles', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const TODAY = getToday();
  const MONTH = TODAY.slice(0, 7);
  // start_date '-01' <= today and end_date '-31' >= today for any day this month
  // (lexicographic string compare on zero-padded ISO dates).
  const CURRENT = { id:'cyc-cur', budget_centre_id:'centre-1', name:'Current', start_date: MONTH + '-01', end_date: MONTH + '-31', anchor_type:'calendar', deleted_at:null };
  const PAST    = { id:'cyc-old', budget_centre_id:'centre-1', name:'Old',     start_date:'2000-01-01', end_date:'2000-01-31', anchor_type:'calendar', deleted_at:null };

  const goCycles = (cyclesData) => {
    getTransactionsByCycle.mockResolvedValue({ data: [], error: null });
    getIncomeSources.mockResolvedValue({ data: [], error: null });
    getCyclesForCentre.mockResolvedValue({ data: cyclesData, error: null });
    return renderHook(() => useFinance({ centre: C, allCategories: CATS }));
  };

  it('loads cycles on mount via getCyclesForCentre(centreId)', async () => {
    const { result } = goCycles([CURRENT]);
    await waitFor(() => expect(result.current.cycles).toHaveLength(1));
    expect(getCyclesForCentre).toHaveBeenCalledWith('centre-1');
  });

  // ── cyclesLoading flag (cold-load flash fix) ────────────────────────────────
  // Gates every view's first paint so cycles resolve before any empty-state (e.g.
  // NoCurrentPeriodPrompt) can render. See docs/engineering-decisions.md.
  it('cyclesLoading starts true before the first load settles', () => {
    const { result } = goCycles([CURRENT]);          // loadCycles is async — not yet resolved
    expect(result.current.cyclesLoading).toBe(true);
  });

  it('cyclesLoading flips false after a real (valid-centre) loadCycles completes', async () => {
    const { result } = goCycles([CURRENT]);
    await waitFor(() => expect(result.current.cyclesLoading).toBe(false));
    expect(result.current.cycles).toHaveLength(1);
  });

  // Regression lock for the Q3 amendment: useFinance mounts above App's centre gate,
  // so loadCycles fires once with centreId === null. That branch must NOT settle the
  // flag — leaving it true keeps the view gate engaged so no phantom empty frame paints
  // when the dashboard finally mounts. `loading` settles false (null-centre contract),
  // but cyclesLoading must stay true. Without the amendment this expectation fails.
  it('cyclesLoading STAYS true while centreId is null (no pre-settle)', async () => {
    getTransactionsByCycle.mockResolvedValue({ data: [], error: null });
    getIncomeSources.mockResolvedValue({ data: [], error: null });
    getCyclesForCentre.mockResolvedValue({ data: [CURRENT], error: null });
    const { result } = renderHook(() => useFinance({ centre: null, allCategories: [] }));
    await waitFor(() => expect(result.current.loading).toBe(false));   // null-centre settles loading…
    expect(result.current.cyclesLoading).toBe(true);                   // …but NOT cyclesLoading
    expect(getCyclesForCentre).not.toHaveBeenCalled();                 // no real fetch fired
  });

  it('derives activeCycle as the cycle containing today', async () => {
    const { result } = goCycles([PAST, CURRENT]);
    await waitFor(() => expect(result.current.activeCycle).toBeTruthy());
    expect(result.current.activeCycle.id).toBe('cyc-cur');
  });

  // Anchor-aware auto-create + its CYC01-race handling were removed in Phase A of the
  // anchor pivot (budget periods become user-driven in Phase B). Their tests went with
  // them. See engineering-decisions.md.

  it('exposes a working reloadCycles', async () => {
    const { result } = goCycles([CURRENT]);
    await waitFor(() => expect(result.current.cycles).toHaveLength(1));
    expect(typeof result.current.reloadCycles).toBe('function');

    getCyclesForCentre.mockResolvedValue({ data: [CURRENT, PAST], error: null });
    await act(async () => { await result.current.reloadCycles(); });
    await waitFor(() => expect(result.current.cycles).toHaveLength(2));
  });

  it('loadCycle selects the cycle AND the gated loader fetches that cycle by id', async () => {
    const APR = { id:'cyc-apr', budget_centre_id:'centre-1', name:'April 2026', start_date:'2026-04-01', end_date:'2026-04-30', anchor_type:'calendar', deleted_at:null };
    const { result } = goCycles([CURRENT, APR]);
    await waitFor(() => expect(result.current.cycles).toHaveLength(2));
    getTransactionsByCycle.mockClear();

    await act(async () => { result.current.loadCycle('cyc-apr'); });
    await waitFor(() => expect(result.current.activeCycleId).toBe('cyc-apr'));
    expect(result.current.activeMonth).toBe('2026-04');                            // activeMonth still bridged (income slice)
    await waitFor(() => expect(getTransactionsByCycle).toHaveBeenCalledWith('centre-1', 'cyc-apr')); // read by cycle id
  });

  it('loadCycle is a no-op returning null for an unknown id', async () => {
    const { result } = goCycles([CURRENT]);
    await waitFor(() => expect(result.current.cycles).toHaveLength(1));
    let ret;
    await act(async () => { ret = result.current.loadCycle('nope'); });
    expect(ret).toBeNull();
    expect(result.current.activeCycleId).toBeNull();
  });

  // ── createPeriod (Phase B) ──────────────────────────────────────────────────
  it('createPeriod calls the service, refreshes cycles, and selects the new period', async () => {
    const NEW = { id:'cyc-new', budget_centre_id:'centre-1', name:'July 2026', start_date:'2026-07-01', end_date:'2026-07-31', anchor_type:'custom', deleted_at:null };
    const { result } = goCycles([CURRENT]);
    await waitFor(() => expect(result.current.cycles).toHaveLength(1));

    createBudgetPeriod.mockResolvedValue({ data: NEW, error: null });
    getCyclesForCentre.mockResolvedValue({ data: [CURRENT, NEW], error: null });   // refresh sees the new period

    let ret;
    await act(async () => { ret = await result.current.createPeriod({ name: 'July 2026', startDate: '2026-07-01', endDate: '2026-07-31' }); });

    expect(createBudgetPeriod).toHaveBeenCalledWith('centre-1', { name: 'July 2026', startDate: '2026-07-01', endDate: '2026-07-31' });
    expect(ret.data.id).toBe('cyc-new');
    await waitFor(() => expect(result.current.cycles).toHaveLength(2));            // reloadCycles ran
    expect(result.current.activeCycleId).toBe('cyc-new');                          // new period selected
  });

  it('createPeriod surfaces the service error and does NOT refresh or select', async () => {
    const { result } = goCycles([CURRENT]);
    await waitFor(() => expect(result.current.cycles).toHaveLength(1));

    createBudgetPeriod.mockResolvedValue({ data: null, error: { code: 'CYC01', message: 'overlap' } });
    getCyclesForCentre.mockClear();

    let ret;
    await act(async () => { ret = await result.current.createPeriod({ startDate: '2026-07-01', endDate: '2026-07-31' }); });

    expect(ret.error.code).toBe('CYC01');
    expect(getCyclesForCentre).not.toHaveBeenCalled();   // no refresh on failure
    expect(result.current.activeCycleId).toBeNull();
  });

  // ── resetPeriod (reset budget period) ────────────────────────────────────────
  it('resetPeriod calls the service then refreshes cycles, returning the counts', async () => {
    const counts = { categories_reset: 2, transactions_reset: 4, cycle_id: 'cyc-cur' };
    const { result } = goCycles([CURRENT]);
    await waitFor(() => expect(result.current.cycles).toHaveLength(1));

    resetBudgetPeriod.mockResolvedValue({ data: counts, error: null });
    getCyclesForCentre.mockClear();
    getCyclesForCentre.mockResolvedValue({ data: [CURRENT], error: null });   // refresh after reset

    let ret;
    await act(async () => { ret = await result.current.resetPeriod('cyc-cur'); });

    expect(resetBudgetPeriod).toHaveBeenCalledWith('cyc-cur');
    expect(ret.data).toEqual(counts);
    await waitFor(() => expect(getCyclesForCentre).toHaveBeenCalled());   // reloadCycles ran
  });

  it('resetPeriod surfaces the service error and does NOT refresh', async () => {
    const { result } = goCycles([CURRENT]);
    await waitFor(() => expect(result.current.cycles).toHaveLength(1));

    resetBudgetPeriod.mockResolvedValue({ data: null, error: { code: 'CYC04', message: 'cannot reset' } });
    getCyclesForCentre.mockClear();

    let ret;
    await act(async () => { ret = await result.current.resetPeriod('cyc-cur'); });

    expect(ret.error.code).toBe('CYC04');
    expect(getCyclesForCentre).not.toHaveBeenCalled();   // no refresh on failure
  });

  // ── visibleCycles (history visibility gate) ──────────────────────────────────
  // The newest-N window over `cycles` (3 free / Infinity pro). `cycles` stays full.
  describe('visibleCycles', () => {
    const C5 = [
      CURRENT,
      { id:'c-apr', budget_centre_id:'centre-1', name:'Apr', start_date:'2025-04-01', end_date:'2025-04-30', anchor_type:'calendar', deleted_at:null },
      { id:'c-mar', budget_centre_id:'centre-1', name:'Mar', start_date:'2025-03-01', end_date:'2025-03-31', anchor_type:'calendar', deleted_at:null },
      { id:'c-feb', budget_centre_id:'centre-1', name:'Feb', start_date:'2025-02-01', end_date:'2025-02-28', anchor_type:'calendar', deleted_at:null },
      { id:'c-jan', budget_centre_id:'centre-1', name:'Jan', start_date:'2025-01-01', end_date:'2025-01-31', anchor_type:'calendar', deleted_at:null },
    ];
    const goPlan = (cyclesData, userPlan) => {
      getTransactionsByCycle.mockResolvedValue({ data: [], error: null });
      getIncomeSources.mockResolvedValue({ data: [], error: null });
      getCyclesForCentre.mockResolvedValue({ data: cyclesData, error: null });
      return renderHook(() => useFinance({ centre: C, allCategories: CATS, userPlan }));
    };

    it('free: windows to the newest 3 cycles; full cycles list stays intact', async () => {
      const { result } = goPlan(C5, 'free');
      await waitFor(() => expect(result.current.cycles).toHaveLength(5));
      expect(result.current.visibleCycles).toHaveLength(3);
      expect(result.current.visibleCycles.map(c => c.id)).toEqual(['cyc-cur', 'c-apr', 'c-mar']);
    });

    it('pro: visibleCycles === all cycles', async () => {
      const { result } = goPlan(C5, 'pro');
      await waitFor(() => expect(result.current.cycles).toHaveLength(5));
      expect(result.current.visibleCycles).toHaveLength(5);
    });

    it('defaults to free when userPlan omitted', async () => {
      const { result } = goPlan(C5);   // no userPlan → 'free'
      await waitFor(() => expect(result.current.cycles).toHaveLength(5));
      expect(result.current.visibleCycles).toHaveLength(3);
    });

    it('hub with ≤3 cycles: no-op (visibleCycles === cycles) for free', async () => {
      const { result } = goPlan([CURRENT, PAST], 'free');
      await waitFor(() => expect(result.current.cycles).toHaveLength(2));
      expect(result.current.visibleCycles).toHaveLength(2);
    });
  });
});