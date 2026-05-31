/**
 * hooks/useBudgetCentre.test.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
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

import { getCentreById, archiveCentre, deleteCentre, unarchiveCentre } from '../services/centres.service';
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
    expect(result.current.categories).toEqual([]);
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
    expect(result.current.categories).toEqual([]);

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
    await act(async () => { await result.current.copyCategoriesToMonth(FROM, TO); });

    expect(bulkAddCategories).toHaveBeenCalledTimes(1);
    const [cid, rows] = bulkAddCategories.mock.calls[0];
    expect(cid).toBe('c-1');
    expect(rows).toHaveLength(3);
    expect(rows.every(r => r.month === TO)).toBe(true);
    expect(rows.map(r => r.name).sort()).toEqual(['Fun', 'Groceries', 'Transport']);
    expect(result.current.categories).toHaveLength(3);   // server rows landed
  });

  it('copyCategoriesToMonth copies only the explicitly selected subset', async () => {
    const { result } = await mountEmpty();
    getCategories.mockResolvedValue({ data: mockPrevMonthCategories, error: null });
    await act(async () => { await result.current.loadPrevMonthCategories(FROM); });

    bulkAddCategories.mockResolvedValue({ data: [{ id: 'new-2', name: 'Transport', month: TO }], error: null });
    await act(async () => { await result.current.copyCategoriesToMonth(FROM, TO, ['pcat-2']); });

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
    expect(result.current.categories).toHaveLength(0);

    let resolveBulk;
    bulkAddCategories.mockReturnValue(new Promise(res => { resolveBulk = res; }));

    let pending;
    await act(async () => { pending = result.current.copyCategoriesToMonth(FROM, TO); });
    // Optimistic: all 3 rows present before the service settles.
    expect(result.current.categories).toHaveLength(3);
    expect(result.current.categories.every(c => c._optimistic)).toBe(true);

    await act(async () => { resolveBulk({ data: null, error: new Error('network') }); await pending; });
    // Rolled back — every optimistic row removed.
    expect(result.current.categories).toHaveLength(0);
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

  it('exposes categories as the current-month slice of allCategories', async () => {
    const { result } = await mountLoaded();
    expect(result.current.categories).toHaveLength(2);
    expect(result.current.categories.every(c => c.month === THIS_M)).toBe(true);
    expect(result.current.categories.map(c => c.id)).toEqual(['cat-1', 'cat-2']);   // sort_order preserved
  });

  it('addCategory writes to allCategories and surfaces in the current-month slice', async () => {
    const { result } = await mountLoaded();
    addCategory.mockResolvedValue({ data: { id: 'cat-9', name: 'Health', budget_amount: 100, month: THIS_M }, error: null });
    await act(async () => { await result.current.addCategory({ name: 'Health', budget_amount: 100, month: THIS_M }); });
    expect(result.current.allCategories.some(c => c.id === 'cat-9')).toBe(true);
    expect(result.current.categories.some(c => c.id === 'cat-9')).toBe(true);
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
