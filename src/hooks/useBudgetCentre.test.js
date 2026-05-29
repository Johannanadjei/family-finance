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
  getCategories:  vi.fn().mockResolvedValue({ data: [], error: null }),
  addCategory:    vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
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
import { getMembers } from '../services/members.service';

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
