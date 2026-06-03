import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useFinance } from './useFinance';
vi.mock('../lib/auth', () => ({ waitForSession: vi.fn().mockResolvedValue({ data: { session: { expires_at: 9999999999 } }, error: null }), warnOnEmptyColdLoad: vi.fn(), sessionAgeMs: vi.fn(() => 0) }));
vi.mock('../services/transactions.service', () => ({ getTransactionsByCycle: vi.fn(), addTransaction: vi.fn(), updateTransaction: vi.fn(), deleteTransaction: vi.fn(), moveTransactionToCycle: vi.fn() }));
vi.mock('../services/income.service', () => ({ getIncomeSources: vi.fn(), markReceived: vi.fn(), markPending: vi.fn(), updateExpectedAmount: vi.fn() }));
vi.mock('../services/cycles.service', () => ({ getCyclesForCentre: vi.fn().mockResolvedValue({ data: [], error: null }), createCycleByAnchor: vi.fn().mockResolvedValue({ data: null, error: null }) }));
vi.mock('../lib/storage', () => ({ loadPrefs: () => ({ themeSkin: 'family_warmth' }), saveThemeSkin: vi.fn(), saveThemeAccent: vi.fn(), saveNotifications: vi.fn() }));
import { getTransactionsByCycle } from '../services/transactions.service';
import { getIncomeSources } from '../services/income.service';
import { getCyclesForCentre, createCycleByAnchor } from '../services/cycles.service';
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

  it('derives activeCycle as the cycle containing today', async () => {
    const { result } = goCycles([PAST, CURRENT]);
    await waitFor(() => expect(result.current.activeCycle).toBeTruthy());
    expect(result.current.activeCycle.id).toBe('cyc-cur');
  });

  it('auto-creates the next cycle (anchor-aware) when today falls in a gap', async () => {
    createCycleByAnchor.mockResolvedValue({ data: CURRENT, error: null });
    const { result } = goCycles([PAST]);   // no cycle covers today; PAST is the most recent
    // calendar anchor (C has no cycle_anchor_type), reference = PAST.end + 1.
    await waitFor(() => expect(createCycleByAnchor).toHaveBeenCalledWith(
      'centre-1',
      expect.objectContaining({ anchor_type: 'calendar', reference_date: '2000-02-01' }),
    ));
    expect(result.current.error).toBeNull();   // auto-create never surfaces to the UI
  });

  it('auto-creates the first cycle for a hub with NO cycles (relaxed guard, reference = today)', async () => {
    createCycleByAnchor.mockResolvedValue({ data: CURRENT, error: null });
    goCycles([]);   // brand-new hub, zero cycles — the dropped length===0 guard lets this fire
    await waitFor(() => expect(createCycleByAnchor).toHaveBeenCalledWith(
      'centre-1',
      expect.objectContaining({ anchor_type: 'calendar', reference_date: TODAY }),
    ));
  });

  it('does NOT auto-create when a current cycle already exists', async () => {
    const { result } = goCycles([CURRENT]);
    await waitFor(() => expect(result.current.cycles).toHaveLength(1));
    expect(createCycleByAnchor).not.toHaveBeenCalled();
  });

  it('handles a CYC01 race by refetching without surfacing an error', async () => {
    getTransactionsByCycle.mockResolvedValue({ data: [], error: null });
    getIncomeSources.mockResolvedValue({ data: [], error: null });
    getCyclesForCentre
      .mockResolvedValueOnce({ data: [PAST], error: null })          // gap → triggers auto-create
      .mockResolvedValue({ data: [PAST, CURRENT], error: null });    // another client won → refetch sees current
    createCycleByAnchor.mockResolvedValue({ data: null, error: { code: 'CYC01', message: 'A cycle already exists' } });

    const { result } = renderHook(() => useFinance({ centre: C, allCategories: CATS }));
    await waitFor(() => expect(createCycleByAnchor).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.activeCycle?.id).toBe('cyc-cur'));
    expect(result.current.error).toBeNull();
  });

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
});