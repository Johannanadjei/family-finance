/**
 * hooks/useBudgetCentre.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act }              from '@testing-library/react';
import { useBudgetCentre }                      from './useBudgetCentre';

// Supabase chain mock.
// All terminal awaits (chains ending in .is/.eq/.order) resolve to { data: [], error: null }.
// .maybeSingle() resolves to { data: null, error: null } — no centre found by default.
vi.mock('../lib/supabase', () => {
  const makeChain = () => {
    const chain = {
      select:      () => chain,
      is:          () => chain,
      order:       () => chain,
      limit:       () => chain,
      eq:          () => chain,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then:        (resolve) => resolve({ data: [], error: null }),
    };
    return chain;
  };
  return { supabase: { from: () => makeChain() } };
});

vi.mock('../lib/auth', () => ({
  waitForSession: vi.fn().mockResolvedValue({ data: { session: { expires_at: 9999999999 } }, error: null }),
  warnOnEmptyColdLoad: vi.fn(),
  sessionAgeMs: vi.fn(() => 0),
}));

vi.mock('../services/centres.service', () => ({
  getCentreById:   vi.fn(),
  getFirstCentre:  vi.fn().mockResolvedValue({ data: null, error: null }),
  updateCentre:    vi.fn(),
  archiveCentre:   vi.fn(),
  deleteCentre:    vi.fn(),
  unarchiveCentre: vi.fn(),
}));

vi.mock('../services/categories.service', () => ({
  getCategories:     vi.fn().mockResolvedValue({ data: [], error: null }),
  getAllCategories:  vi.fn().mockResolvedValue({ data: [], error: null }),
  addCategory:       vi.fn(),
  bulkAddCategories: vi.fn(),
  updateCategory:    vi.fn(),
  deleteCategory:    vi.fn(),
}));

vi.mock('../services/members.service', () => ({
  getMembers:       vi.fn().mockResolvedValue({ data: [], error: null }),
  addMember:        vi.fn(),
  removeMember:     vi.fn(),
  updateMemberRole: vi.fn(),
}));

vi.mock('../services/auth.service', () => ({
  getUserSession: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
}));

import { getCentreById, updateCentre, archiveCentre, deleteCentre, unarchiveCentre } from '../services/centres.service';
import { getCategories, getAllCategories, addCategory, bulkAddCategories, updateCategory, deleteCategory } from '../services/categories.service';
import { getMembers } from '../services/members.service';
import { getCurrentMonth, offsetMonth } from '../lib/finance';
import { mockPrevMonthCategories, mockAllCategories } from '../test-utils/fixtures';

const mockUser   = { id: 'user-1' };
const mockCentre = { id: 'c-1', name: "The Adjei's", currency: 'GHS', skin_id: 'family_warmth' };

describe('useBudgetCentre', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns empty state when no user', async () => {
    const { result } = renderHook(() => useBudgetCentre(null, null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.centre).toBeNull();
    expect(result.current.allCategories).toEqual([]);
    expect(result.current.needsOnboarding).toBe(false);
  });

  it('sets needsOnboarding when no centre found on initial load', async () => {
    // supabase mock: maybeSingle() returns null (no centres)
    const { result } = renderHook(() => useBudgetCentre(mockUser, null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.needsOnboarding).toBe(true);
    expect(result.current.centre).toBeNull();
  });

  it('calls getCentreById when centreId is provided', async () => {
    getCentreById.mockResolvedValue({ data: mockCentre, error: null });
    const { result } = renderHook(() => useBudgetCentre(mockUser, 'c-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getCentreById).toHaveBeenCalledWith('c-1');
  });

  it('loads the resolved centre into state', async () => {
    getCentreById.mockResolvedValue({ data: mockCentre, error: null });
    const { result } = renderHook(() => useBudgetCentre(mockUser, 'c-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.centre).toEqual(mockCentre);
  });

  it('does NOT trigger needsOnboarding when switching to an empty hub', async () => {
    // centreId provided + categories empty → must show empty state, NOT onboarding
    getCentreById.mockResolvedValue({ data: mockCentre, error: null });
    const { result } = renderHook(() => useBudgetCentre(mockUser, 'c-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.needsOnboarding).toBe(false);
    expect(result.current.centre).toEqual(mockCentre);
  });

  it('falls back to first centre when provided centreId resolves to null', async () => {
    // Stale ID returns no data — hook falls back to fetchFirstCentre (supabase mock → null)
    getCentreById.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useBudgetCentre(mockUser, 'stale-id'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getCentreById).toHaveBeenCalledWith('stale-id');
    // fetchFirstCentre fallback also returns null → triggers onboarding (user has no centres)
    expect(result.current.needsOnboarding).toBe(true);
  });

  it('sets error when getCentreById fails', async () => {
    getCentreById.mockResolvedValue({ data: null, error: { message: 'network error' } });
    const { result } = renderHook(() => useBudgetCentre(mockUser, 'c-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('network error');
  });

  it('removedFromHub is false when user is in members list', async () => {
    getCentreById.mockResolvedValue({ data: mockCentre, error: null });
    getMembers.mockResolvedValue({ data: [{ id: 'mem-1', user_id: 'user-1', role: 'standard' }], error: null });
    const { result } = renderHook(() => useBudgetCentre(mockUser, 'c-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.removedFromHub).toBe(false);
  });

  it('removedFromHub is true when user is not found in a non-empty members list', async () => {
    getCentreById.mockResolvedValue({ data: mockCentre, error: null });
    getMembers.mockResolvedValue({ data: [{ id: 'mem-2', user_id: 'user-99', role: 'standard' }], error: null });
    const { result } = renderHook(() => useBudgetCentre(mockUser, 'c-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.removedFromHub).toBe(true);
  });

  it('removedFromHub is false when members list is empty (no false positive)', async () => {
    getCentreById.mockResolvedValue({ data: mockCentre, error: null });
    getMembers.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useBudgetCentre(mockUser, 'c-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.removedFromHub).toBe(false);
  });

  it('removedFromHub is false when members fetch errors (no false positive)', async () => {
    getCentreById.mockResolvedValue({ data: mockCentre, error: null });
    getMembers.mockResolvedValue({ data: [], error: new Error('network') });
    const { result } = renderHook(() => useBudgetCentre(mockUser, 'c-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.removedFromHub).toBe(false);
  });

  it('exposes reload and onOnboardingComplete as functions', async () => {
    getCentreById.mockResolvedValue({ data: mockCentre, error: null });
    const { result } = renderHook(() => useBudgetCentre(mockUser, 'c-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(typeof result.current.reload).toBe('function');
    expect(typeof result.current.onOnboardingComplete).toBe('function');
  });

  // ── Archive / delete mutations ─────────────────────────────────────────────

  it('exposes archiveCentre and permanentDeleteCentre as functions', async () => {
    getCentreById.mockResolvedValue({ data: mockCentre, error: null });
    const { result } = renderHook(() => useBudgetCentre(mockUser, 'c-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(typeof result.current.archiveCentre).toBe('function');
    expect(typeof result.current.permanentDeleteCentre).toBe('function');
  });

  it('archiveCentre calls the service with the given centreId', async () => {
    getCentreById.mockResolvedValue({ data: mockCentre, error: null });
    archiveCentre.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useBudgetCentre(mockUser, 'c-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.archiveCentre('c-1'); });
    expect(archiveCentre).toHaveBeenCalledWith('c-1');
  });

  it('archiveCentre returns { error: null } on success', async () => {
    getCentreById.mockResolvedValue({ data: mockCentre, error: null });
    archiveCentre.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useBudgetCentre(mockUser, 'c-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let res;
    await act(async () => { res = await result.current.archiveCentre('c-1'); });
    expect(res.error).toBeNull();
  });

  it('archiveCentre returns { error } on failure', async () => {
    getCentreById.mockResolvedValue({ data: mockCentre, error: null });
    archiveCentre.mockResolvedValue({ error: new Error('db error') });
    const { result } = renderHook(() => useBudgetCentre(mockUser, 'c-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let res;
    await act(async () => { res = await result.current.archiveCentre('c-1'); });
    expect(res.error).toBeTruthy();
  });

  it('permanentDeleteCentre calls deleteCentre service with the given centreId', async () => {
    getCentreById.mockResolvedValue({ data: mockCentre, error: null });
    deleteCentre.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useBudgetCentre(mockUser, 'c-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.permanentDeleteCentre('c-1'); });
    expect(deleteCentre).toHaveBeenCalledWith('c-1');
  });

  it('permanentDeleteCentre returns { error: null } on success', async () => {
    getCentreById.mockResolvedValue({ data: mockCentre, error: null });
    deleteCentre.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useBudgetCentre(mockUser, 'c-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let res;
    await act(async () => { res = await result.current.permanentDeleteCentre('c-1'); });
    expect(res.error).toBeNull();
  });

  it('exposes restoreHub as a function', async () => {
    getCentreById.mockResolvedValue({ data: mockCentre, error: null });
    const { result } = renderHook(() => useBudgetCentre(mockUser, 'c-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(typeof result.current.restoreHub).toBe('function');
  });

  it('restoreHub calls unarchiveCentre service with the given centreId', async () => {
    getCentreById.mockResolvedValue({ data: mockCentre, error: null });
    unarchiveCentre.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useBudgetCentre(mockUser, 'c-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.restoreHub('a-1'); });
    expect(unarchiveCentre).toHaveBeenCalledWith('a-1');
  });

  it('restoreHub returns { error: null } on success', async () => {
    getCentreById.mockResolvedValue({ data: mockCentre, error: null });
    unarchiveCentre.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useBudgetCentre(mockUser, 'c-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let res;
    await act(async () => { res = await result.current.restoreHub('a-1'); });
    expect(res.error).toBeNull();
  });

  it('restoreHub returns { error } on failure', async () => {
    getCentreById.mockResolvedValue({ data: mockCentre, error: null });
    unarchiveCentre.mockResolvedValue({ error: new Error('db error') });
    const { result } = renderHook(() => useBudgetCentre(mockUser, 'c-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let res;
    await act(async () => { res = await result.current.restoreHub('a-1'); });
    expect(res.error).toBeTruthy();
  });
});

// ── Phase 2C: budget rollforward (loadPrevMonthCategories + copyCategoriesToMonth) ──
const FROM = offsetMonth(getCurrentMonth(), -1);   // previous month — matches mockPrevMonthCategories
const TO   = getCurrentMonth();

// Mount with a resolved centre and an EMPTY current month, so categories start [].
const mountEmpty = async () => {
  getCentreById.mockResolvedValue({ data: mockCentre, error: null });
  getCategories.mockResolvedValue({ data: [], error: null });
  const view = renderHook(() => useBudgetCentre(mockUser, 'c-1'));
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
};

describe('useBudgetCentre — budget rollforward (Phase 2C)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('loadPrevMonthCategories fetches the previous month and stores it', async () => {
    const { result } = await mountEmpty();
    expect(result.current.allCategories).toEqual([]);

    getCategories.mockResolvedValue({ data: mockPrevMonthCategories, error: null });
    await act(async () => { await result.current.loadPrevMonthCategories(FROM); });

    expect(getCategories).toHaveBeenLastCalledWith('c-1', FROM);
    expect(result.current.prevMonthCategories).toHaveLength(3);
  });

  it('copyCategoriesToMonth copies ALL prev categories into the target month when no ids passed', async () => {
    const { result } = await mountEmpty();
    getCategories.mockResolvedValue({ data: mockPrevMonthCategories, error: null });
    await act(async () => { await result.current.loadPrevMonthCategories(FROM); });

    bulkAddCategories.mockResolvedValue({ data: mockPrevMonthCategories.map(c => ({ ...c, id: 'new-' + c.id, month: TO })), error: null });
    // 4th arg = targetCycleId, resolved by the caller (BudgetView) — Commit 11.5.
    await act(async () => { await result.current.copyCategoriesToMonth(FROM, TO, undefined, 'cyc-this'); });

    expect(bulkAddCategories).toHaveBeenCalledTimes(1);
    const [cid, rows, cycleId] = bulkAddCategories.mock.calls[0];
    expect(cid).toBe('c-1');
    expect(cycleId).toBe('cyc-this');   // Commit 14a — cycle_id stamped into the DB insert too
    expect(rows).toHaveLength(3);
    expect(rows.every(r => r.month === TO)).toBe(true);
    expect(rows.map(r => r.name).sort()).toEqual(['Fun', 'Groceries', 'Transport']);
    expect(result.current.allCategories).toHaveLength(3);   // server rows landed
  });

  it('copyCategoriesToMonth copies only the explicitly selected subset', async () => {
    const { result } = await mountEmpty();
    getCategories.mockResolvedValue({ data: mockPrevMonthCategories, error: null });
    await act(async () => { await result.current.loadPrevMonthCategories(FROM); });

    bulkAddCategories.mockResolvedValue({ data: [{ id: 'new-2', name: 'Transport', month: TO }], error: null });
    await act(async () => { await result.current.copyCategoriesToMonth(FROM, TO, ['pcat-2'], 'cyc-this'); });

    const [, rows] = bulkAddCategories.mock.calls[0];
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Transport');
  });

  it('is a no-op (no insert) when the previous month has no categories', async () => {
    const { result } = await mountEmpty();   // prevMonthCategories never loaded → empty
    await act(async () => {
      const r = await result.current.copyCategoriesToMonth(FROM, TO);
      expect(r.error).toBeNull();
      expect(r.data).toEqual([]);
    });
    expect(bulkAddCategories).not.toHaveBeenCalled();
  });

  it('inserts optimistic rows immediately, then rolls them ALL back when the bulk insert fails', async () => {
    const { result } = await mountEmpty();
    getCategories.mockResolvedValue({ data: mockPrevMonthCategories, error: null });
    await act(async () => { await result.current.loadPrevMonthCategories(FROM); });
    expect(result.current.allCategories).toHaveLength(0);

    let resolveBulk;
    bulkAddCategories.mockReturnValue(new Promise(res => { resolveBulk = res; }));

    let pending;
    await act(async () => { pending = result.current.copyCategoriesToMonth(FROM, TO, undefined, 'cyc-this'); });
    // Optimistic: all 3 rows present before the service settles, each stamped cycle_id.
    expect(result.current.allCategories).toHaveLength(3);
    expect(result.current.allCategories.every(c => c._optimistic && c.cycle_id === 'cyc-this')).toBe(true);

    await act(async () => { resolveBulk({ data: null, error: new Error('network') }); await pending; });
    // Rolled back — every optimistic row removed.
    expect(result.current.allCategories).toHaveLength(0);
  });
});

// ── Phase 2D: all-months categories (allCategories + current-month slice) ──
// mockAllCategories spans THIS_MONTH (cat-1, cat-2) + LAST_MONTH (acat-3, acat-4).
const THIS_M = getCurrentMonth();

const mountLoaded = async () => {
  getCentreById.mockResolvedValue({ data: mockCentre, error: null });
  getAllCategories.mockResolvedValue({ data: mockAllCategories, error: null });
  const view = renderHook(() => useBudgetCentre(mockUser, 'c-1'));
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
};

describe('useBudgetCentre — all-months categories (Phase 2D)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('loads every month into allCategories on mount (no month filter)', async () => {
    const { result } = await mountLoaded();
    expect(getAllCategories).toHaveBeenCalledWith('c-1');   // single arg — not month-filtered
    expect(result.current.allCategories).toHaveLength(4);
  });

  // reloadCategories — the post-reset re-sync (cross-context bridge from useResetPeriod).
  it('reloadCategories re-fetches allCategories from the server', async () => {
    const { result } = await mountLoaded();
    expect(result.current.allCategories).toHaveLength(4);
    // Server now returns fewer rows (a reset soft-deleted the rest).
    getAllCategories.mockResolvedValue({ data: mockAllCategories.slice(0, 2), error: null });
    await act(async () => { await result.current.reloadCategories(); });
    expect(getAllCategories).toHaveBeenLastCalledWith('c-1');
    expect(result.current.allCategories).toHaveLength(2);
  });

  it('reloadCategories keeps the existing list on fetch error (§12 — never blanks it)', async () => {
    const { result } = await mountLoaded();
    expect(result.current.allCategories).toHaveLength(4);
    getAllCategories.mockResolvedValue({ data: null, error: { message: 'network' } });
    await act(async () => { await result.current.reloadCategories(); });
    expect(result.current.allCategories).toHaveLength(4);   // unchanged, not wiped to []
  });

  // The current-cycle `categories` slice moved to useFinance (Commit 11.5) — its
  // cycle-keyed derivation is covered in useFinance.test.js. useBudgetCentre owns
  // only allCategories + the mutations below.

  it('addCategory writes the server row into allCategories', async () => {
    const { result } = await mountLoaded();
    addCategory.mockResolvedValue({ data: { id: 'cat-9', name: 'Health', budget_amount: 100, month: THIS_M, cycle_id: 'cyc-this' }, error: null });
    await act(async () => { await result.current.addCategory({ name: 'Health', budget_amount: 100, month: THIS_M }); });
    expect(result.current.allCategories.some(c => c.id === 'cat-9')).toBe(true);
  });

  // Commit 14a — the caller (view) resolves the cycle id and passes it as the 2nd
  // arg; addCategory threads it to the service so the DB insert stamps cycle_id.
  it('addCategory threads targetCycleId to the service', async () => {
    const { result } = await mountLoaded();
    addCategory.mockResolvedValue({ data: { id: 'cat-9', name: 'Health', budget_amount: 100, month: THIS_M, cycle_id: 'cyc-this' }, error: null });
    await act(async () => { await result.current.addCategory({ name: 'Health', budget_amount: 100, month: THIS_M }, 'cyc-this'); });
    expect(addCategory).toHaveBeenCalledWith('c-1', expect.objectContaining({ name: 'Health' }), 'cyc-this');
  });

  it('updateCategory rollback restores the row AND preserves other months (snapshot is allCategories, not the slice)', async () => {
    const { result } = await mountLoaded();
    updateCategory.mockResolvedValue({ data: null, error: new Error('db') });
    await act(async () => { await result.current.updateCategory('cat-1', { budget_amount: 999 }); });
    expect(result.current.allCategories).toHaveLength(4);                                       // other months intact
    expect(result.current.allCategories.find(c => c.id === 'cat-1').budget_amount).toBe(500);   // restored
    expect(result.current.allCategories.some(c => c.id === 'acat-3')).toBe(true);               // LAST_MONTH untouched
  });

  it('updateCategory success replaces the row in allCategories', async () => {
    const { result } = await mountLoaded();
    updateCategory.mockResolvedValue({ data: { ...mockAllCategories[0], budget_amount: 777 }, error: null });
    await act(async () => { await result.current.updateCategory('cat-1', { budget_amount: 777 }); });
    expect(result.current.allCategories.find(c => c.id === 'cat-1').budget_amount).toBe(777);
  });

  it('deleteCategory rollback restores the row AND preserves other months', async () => {
    const { result } = await mountLoaded();
    deleteCategory.mockResolvedValue({ error: new Error('db') });
    await act(async () => { await result.current.deleteCategory('cat-1'); });
    expect(result.current.allCategories).toHaveLength(4);
    expect(result.current.allCategories.some(c => c.id === 'cat-1')).toBe(true);
  });

  it('deleteCategory success removes only the target row from allCategories', async () => {
    const { result } = await mountLoaded();
    deleteCategory.mockResolvedValue({ error: null });
    await act(async () => { await result.current.deleteCategory('cat-1'); });
    expect(result.current.allCategories.some(c => c.id === 'cat-1')).toBe(false);
    expect(result.current.allCategories).toHaveLength(3);   // acat-3, acat-4, cat-2 remain
  });
});

// ── updateCentre wrapper — load-bearing null-guard ────────────────────────────
// updateCentreService uses .maybeSingle(): an RLS-blocked write returns
// { data: null, error: null }. Without the guard the wrapper would setCentre(null)
// and blank the user's view. The guard restores prev and reports a no-op.
describe('useBudgetCentre — updateCentre wrapper null-guard', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('does NOT blank the centre when the write returns { data: null, error: null }', async () => {
    const { result } = await mountLoaded();
    updateCentre.mockResolvedValue({ data: null, error: null });   // RLS-blocked, no exception
    let ret;
    await act(async () => { ret = await result.current.updateCentre({ name: 'New name' }); });
    expect(result.current.centre?.id).toBe('c-1');   // centre preserved, not nulled
    expect(ret.error).toBeNull();
    expect(ret.data?.id).toBe('c-1');                // no-op returns prev
  });

  it('replaces the centre with the server row on success', async () => {
    const { result } = await mountLoaded();
    updateCentre.mockResolvedValue({ data: { ...mockCentre, name: 'Renamed' }, error: null });
    await act(async () => { await result.current.updateCentre({ name: 'Renamed' }); });
    expect(result.current.centre?.name).toBe('Renamed');
  });

  it('rolls back to prev on an explicit error', async () => {
    const { result } = await mountLoaded();
    updateCentre.mockResolvedValue({ data: null, error: { message: 'boom' } });
    let ret;
    await act(async () => { ret = await result.current.updateCentre({ name: 'Nope' }); });
    expect(result.current.centre?.name).toBe(mockCentre.name);   // rolled back
    expect(ret.error).toBeTruthy();
  });
});

// ── Timezone self-correction (Budget Cycles, Commit 4) ────────────────────────
// Intl resolves to the test environment's zone (usually UTC in CI), so the
// effect's "browser zone" must be stubbed to a non-UTC value to observe a write.
describe('useBudgetCentre — timezone self-correct', () => {
  let tzSpy;
  beforeEach(() => {
    vi.clearAllMocks();
    tzSpy = vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
      resolvedOptions: () => ({ timeZone: 'Africa/Accra' }),
    });
  });
  afterEach(() => { tzSpy.mockRestore(); });

  it("writes the browser zone when the hub timezone is still 'UTC' (writer role)", async () => {
    getCentreById.mockResolvedValue({ data: { ...mockCentre, timezone: 'UTC' }, error: null });
    getMembers.mockResolvedValue({ data: [{ user_id: 'user-1', role: 'owner' }], error: null });
    updateCentre.mockResolvedValue({ data: { ...mockCentre, timezone: 'Africa/Accra' }, error: null });

    renderHook(() => useBudgetCentre(mockUser, 'c-1'));
    await waitFor(() => expect(updateCentre).toHaveBeenCalledWith('c-1', { timezone: 'Africa/Accra' }));
  });

  it('does NOT write when the hub timezone is already set', async () => {
    getCentreById.mockResolvedValue({ data: { ...mockCentre, timezone: 'Europe/London' }, error: null });
    getMembers.mockResolvedValue({ data: [{ user_id: 'user-1', role: 'owner' }], error: null });

    const { result } = renderHook(() => useBudgetCentre(mockUser, 'c-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(updateCentre).not.toHaveBeenCalled();
  });

  it('a standard member never attempts the write (gate blocks it at source)', async () => {
    getCentreById.mockResolvedValue({ data: { ...mockCentre, timezone: 'UTC' }, error: null });
    getMembers.mockResolvedValue({ data: [{ user_id: 'user-1', role: 'standard' }], error: null });

    const { result } = renderHook(() => useBudgetCentre(mockUser, 'c-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(updateCentre).not.toHaveBeenCalled();   // no RLS-blocked write fired — no 406
  });

  it('swallows a server error for a writer (does not throw, hub stays usable)', async () => {
    getCentreById.mockResolvedValue({ data: { ...mockCentre, timezone: 'UTC' }, error: null });
    getMembers.mockResolvedValue({ data: [{ user_id: 'user-1', role: 'owner' }], error: null });
    updateCentre.mockResolvedValue({ data: null, error: { message: 'server error' } });

    const { result } = renderHook(() => useBudgetCentre(mockUser, 'c-1'));
    await waitFor(() => expect(updateCentre).toHaveBeenCalled());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.centre?.id).toBe('c-1');   // still usable; error swallowed
  });
});
