/**
 * hooks/useFinance.autocontinue.test.js
 *
 * The AUTO-CONTINUE guards and the refetch contract (migrate_28 client half).
 *
 * This is a WRITE that fires on hub open against the shared production database, so
 * the guards are not incidental — they are the reason it is safe. Each one gets a
 * test that fails loudly if a refactor drops it:
 *
 *   1. ROLE      — never fires from a standard-member session (§ 'role gate')
 *   2. COVERED   — never fires when a period already contains today
 *   3. ONCE      — one call per centreId + YYYY-MM per session, claimed before the
 *                  await so the refresh it triggers cannot re-enter it
 *   4. NO RETRY  — a failure is final for that hub+month; nothing is rescheduled
 *
 * Plus the requirement the whole feature turns on: on success the UI REFETCHES —
 * cycles, the carried-forward categories (which live in a different hook's cache),
 * and the selected period — so the new month is on screen immediately rather than
 * being created silently behind a stale view.
 *
 * The clock is frozen so "today" is deterministic; only Date is faked, leaving
 * setTimeout real for RTL's async helpers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useFinance } from './useFinance';

vi.mock('../lib/auth', () => ({
  waitForSession: vi.fn().mockResolvedValue({ data: { session: { expires_at: 9999999999 } }, error: null }),
  warnOnEmptyColdLoad: vi.fn(), sessionAgeMs: vi.fn(() => 0),
}));
vi.mock('../services/transactions.service', () => ({
  getTransactionsByCycle: vi.fn(), addTransaction: vi.fn(), updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(), moveTransactionToCycle: vi.fn(),
}));
vi.mock('../services/income.service', () => ({
  getIncomeSources: vi.fn(), markReceived: vi.fn(), markPending: vi.fn(), updateExpectedAmount: vi.fn(),
}));
vi.mock('../services/cycles.service', () => ({
  getCyclesForCentre:        vi.fn(),
  createBudgetPeriod:        vi.fn(),
  resetBudgetPeriod:         vi.fn(),
  ensureCurrentBudgetPeriod: vi.fn(),
}));
vi.mock('../lib/storage', () => ({
  loadPrefs: () => ({ themeSkin: 'family_warmth' }),
  saveThemeSkin: vi.fn(), saveThemeAccent: vi.fn(), saveNotifications: vi.fn(),
}));

import { getTransactionsByCycle } from '../services/transactions.service';
import { getIncomeSources }       from '../services/income.service';
import { getCyclesForCentre, ensureCurrentBudgetPeriod } from '../services/cycles.service';

const C  = { id: 'centre-1', currency: 'GHS', surplus_target: 0 };
const C2 = { id: 'centre-2', currency: 'GHS', surplus_target: 0 };

// Frozen "today" = 2026-09-03. AUG has ended; nothing covers today → the gap the
// feature exists for. SEP is what the server creates.
const AUG = { id: 'cyc-aug', budget_centre_id: 'centre-1', name: 'August 2026',    start_date: '2026-08-01', end_date: '2026-08-31', deleted_at: null };
const SEP = { id: 'cyc-sep', budget_centre_id: 'centre-1', name: 'September 2026', start_date: '2026-09-01', end_date: '2026-09-30', deleted_at: null };

const CARRIED = {
  cycle_id: 'cyc-sep', name: 'September 2026', start_date: '2026-09-01', end_date: '2026-09-30',
  created: true, source_cycle_id: 'cyc-aug',
  categories_carried: 5, categories_skipped: 0, income_carried: 2, income_skipped: 0, tier: 'free',
};

// getCyclesForCentre is called again by the post-write refresh; queue the "after"
// list so the second call reflects the newly-created period.
const seedCycles = (first, after = first) => {
  getCyclesForCentre.mockReset();
  getCyclesForCentre.mockResolvedValueOnce({ data: first, error: null })
                    .mockResolvedValue({ data: after, error: null });
};

const mount = (opts = {}) => {
  const { centre = C, role = 'owner', reloadCategories = vi.fn().mockResolvedValue(undefined), allCategories = [] } = opts;
  const hook = renderHook(({ c }) => useFinance({ centre: c, allCategories, memberRole: role, reloadCategories }),
    { initialProps: { c: centre } });
  return { ...hook, reloadCategories };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-03T12:00:00Z'));
  getTransactionsByCycle.mockResolvedValue({ data: [], error: null });
  getIncomeSources.mockResolvedValue({ data: [], error: null });
  ensureCurrentBudgetPeriod.mockResolvedValue({ data: CARRIED, error: null });
});
afterEach(() => { vi.useRealTimers(); });

// ── Guard 1: role ────────────────────────────────────────────────────────────
describe('auto-continue — role gate', () => {
  it('NEVER fires from a standard-member session', async () => {
    seedCycles([AUG]);
    const { result } = mount({ role: 'standard' });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(ensureCurrentBudgetPeriod).not.toHaveBeenCalled();
    expect(result.current.currentCycle).toBeNull();   // still uncovered — banner's job
    expect(result.current.autoPeriod).toBeNull();
  });

  it('does not fire while the role is still unresolved (defaults to standard)', async () => {
    seedCycles([AUG]);
    const { result } = renderHook(() => useFinance({ centre: C, allCategories: [] }));  // no memberRole
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(ensureCurrentBudgetPeriod).not.toHaveBeenCalled();
  });

  it('fires for an owner', async () => {
    seedCycles([AUG], [SEP, AUG]);
    mount({ role: 'owner' });
    await waitFor(() => expect(ensureCurrentBudgetPeriod).toHaveBeenCalledWith('centre-1'));
  });

  it('fires for full_access (the DB twin of can(role, manageCycles))', async () => {
    seedCycles([AUG], [SEP, AUG]);
    mount({ role: 'full_access' });
    await waitFor(() => expect(ensureCurrentBudgetPeriod).toHaveBeenCalledWith('centre-1'));
  });
});

// ── Guard 2: already covered ─────────────────────────────────────────────────
describe('auto-continue — already covered', () => {
  it('does not call the RPC at all when a period contains today', async () => {
    seedCycles([SEP, AUG]);
    const { result } = mount();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(ensureCurrentBudgetPeriod).not.toHaveBeenCalled();
    expect(result.current.currentCycle.id).toBe('cyc-sep');
  });

  it('does not fire on a boundary day (period ends today)', async () => {
    const endsToday = { ...AUG, start_date: '2026-08-15', end_date: '2026-09-03' };
    seedCycles([endsToday]);
    const { result } = mount();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(ensureCurrentBudgetPeriod).not.toHaveBeenCalled();
  });
});

// ── Guard 3: once per session per hub + month ────────────────────────────────
describe('auto-continue — once per session per hub + month', () => {
  it('fires exactly once even though its own refresh re-runs the effect', async () => {
    seedCycles([AUG], [SEP, AUG]);
    const { result, rerender } = mount();
    await waitFor(() => expect(result.current.currentCycle?.id).toBe('cyc-sep'));
    rerender({ c: C });
    rerender({ c: C });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(ensureCurrentBudgetPeriod).toHaveBeenCalledTimes(1);
  });

  // The claim is per centreId + month, not per session, so switching hubs must work.
  it('fires again for a different hub in the same session', async () => {
    getCyclesForCentre.mockResolvedValue({ data: [AUG], error: null });
    const { rerender } = mount();
    await waitFor(() => expect(ensureCurrentBudgetPeriod).toHaveBeenCalledWith('centre-1'));
    rerender({ c: C2 });
    await waitFor(() => expect(ensureCurrentBudgetPeriod).toHaveBeenCalledWith('centre-2'));
    expect(ensureCurrentBudgetPeriod).toHaveBeenCalledTimes(2);
  });

  it('drops the previous hub receipt on switch', async () => {
    seedCycles([AUG], [SEP, AUG]);
    const { result, rerender } = mount();
    await waitFor(() => expect(result.current.autoPeriod).not.toBeNull());
    getCyclesForCentre.mockResolvedValue({ data: [SEP, AUG], error: null });
    rerender({ c: C2 });
    await waitFor(() => expect(result.current.autoPeriod).toBeNull());
  });
});

// ── Guard 4: no retry loop ───────────────────────────────────────────────────
describe('auto-continue — no retry loop on failure', () => {
  it('makes exactly ONE attempt when the RPC fails, and never reschedules', async () => {
    seedCycles([AUG]);
    ensureCurrentBudgetPeriod.mockResolvedValue({ data: null, error: { code: '42501', message: 'not an owner' } });
    const { result, rerender } = mount();
    await waitFor(() => expect(ensureCurrentBudgetPeriod).toHaveBeenCalledTimes(1));
    rerender({ c: C });
    rerender({ c: C });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(ensureCurrentBudgetPeriod).toHaveBeenCalledTimes(1);
    expect(result.current.autoPeriod).toBeNull();
  });

  // A failed write must still leave a usable app: the loader hold releases, data
  // loads against the landing (past) cycle, and today stays uncovered so the banner
  // falls through to its manual-CTA state.
  it('releases the loader and leaves today uncovered so the manual CTA can take over', async () => {
    seedCycles([AUG]);
    ensureCurrentBudgetPeriod.mockResolvedValue({ data: null, error: { message: 'network' } });
    const { result } = mount();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.loaded).toBe(true);
    expect(result.current.currentCycle).toBeNull();
    expect(result.current.viewedCycleId).toBe('cyc-aug');
  });

  it('treats an empty payload as a failure rather than a created period', async () => {
    seedCycles([AUG]);
    ensureCurrentBudgetPeriod.mockResolvedValue({ data: null, error: null });
    const { result } = mount();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.autoPeriod).toBeNull();
  });
});

// ── The refetch contract ─────────────────────────────────────────────────────
describe('auto-continue — refetch on success', () => {
  it('re-fetches cycles, categories and the new period so nothing is created behind a stale view', async () => {
    seedCycles([AUG], [SEP, AUG]);
    const { result, reloadCategories } = mount();

    await waitFor(() => expect(result.current.currentCycle?.id).toBe('cyc-sep'));
    // cycles re-fetched (mount + post-write refresh)
    expect(getCyclesForCentre).toHaveBeenCalledTimes(2);
    // carried-forward categories live in useBudgetCentre's cache — re-synced here
    expect(reloadCategories).toHaveBeenCalledTimes(1);
    // the views land ON the new period, not the old one
    expect(result.current.activeCycleId).toBe('cyc-sep');
    expect(result.current.viewedCycleId).toBe('cyc-sep');
    // and its transactions were fetched for the NEW cycle id
    expect(getTransactionsByCycle).toHaveBeenCalledWith('centre-1', 'cyc-sep');
  });

  it('never fetches against the stale landing cycle while the write is in flight', async () => {
    seedCycles([AUG], [SEP, AUG]);
    const { result } = mount();
    await waitFor(() => expect(result.current.currentCycle?.id).toBe('cyc-sep'));
    // August is the landing cycle; loading it would paint last month's dashboard
    // under last month's name on the 3rd of September.
    expect(getTransactionsByCycle).not.toHaveBeenCalledWith('centre-1', 'cyc-aug');
  });

  it('exposes the carry-forward receipt for the banner', async () => {
    seedCycles([AUG], [SEP, AUG]);
    const { result } = mount();
    await waitFor(() => expect(result.current.autoPeriod).not.toBeNull());
    expect(result.current.autoPeriod).toEqual({
      cycleId: 'cyc-sep', name: 'September 2026', startDate: '2026-09-01', endDate: '2026-09-30',
      sourceCycleId: 'cyc-aug',
      categoriesCarried: 5, categoriesSkipped: 0, incomeCarried: 2, incomeSkipped: 0, tier: 'free',
    });
  });

  it('reports what the tier cap skipped so the receipt can say so', async () => {
    seedCycles([AUG], [SEP, AUG]);
    ensureCurrentBudgetPeriod.mockResolvedValue({
      data: { ...CARRIED, categories_carried: 10, categories_skipped: 3, income_carried: 2, income_skipped: 1 },
      error: null,
    });
    const { result } = mount();
    await waitFor(() => expect(result.current.autoPeriod).not.toBeNull());
    expect(result.current.autoPeriod.categoriesSkipped).toBe(3);
    expect(result.current.autoPeriod.incomeSkipped).toBe(1);
  });

  it('dismissAutoPeriod clears the receipt', async () => {
    seedCycles([AUG], [SEP, AUG]);
    const { result } = mount();
    await waitFor(() => expect(result.current.autoPeriod).not.toBeNull());
    act(() => { result.current.dismissAutoPeriod(); });
    await waitFor(() => expect(result.current.autoPeriod).toBeNull());
  });

  // created:false = a racer (another device, or the manual CTA) got there first. We
  // still refresh, because our list said today was uncovered and the server disagrees
  // — but we show no receipt, because we did not create anything.
  it('created:false refreshes the stale list but shows no receipt', async () => {
    seedCycles([AUG], [SEP, AUG]);
    ensureCurrentBudgetPeriod.mockResolvedValue({
      data: { ...CARRIED, created: false, source_cycle_id: null, categories_carried: 0, income_carried: 0 },
      error: null,
    });
    const { result, reloadCategories } = mount();
    await waitFor(() => expect(result.current.currentCycle?.id).toBe('cyc-sep'));
    expect(getCyclesForCentre).toHaveBeenCalledTimes(2);
    expect(result.current.autoPeriod).toBeNull();
    // nothing was carried, so no category re-sync is needed
    expect(reloadCategories).not.toHaveBeenCalled();
  });
});
