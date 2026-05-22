/**
 * hooks/useBudgetCentre.test.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor }                  from '@testing-library/react';
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

vi.mock('../services/centres.service', () => ({
  getCentreById:   vi.fn(),
  updateCentre:    vi.fn(),
}));

vi.mock('../services/categories.service', () => ({
  addCategory:    vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
}));

vi.mock('../lib/finance', () => ({
  getCurrentMonth: () => '2026-05',
}));

import { getCentreById } from '../services/centres.service';

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

  it('exposes reload and onOnboardingComplete as functions', async () => {
    getCentreById.mockResolvedValue({ data: mockCentre, error: null });
    const { result } = renderHook(() => useBudgetCentre(mockUser, 'c-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(typeof result.current.reload).toBe('function');
    expect(typeof result.current.onOnboardingComplete).toBe('function');
  });
});
