/**
 * hooks/useCentres.test.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor }                  from '@testing-library/react';
import { useCentres }                           from './useCentres';

vi.mock('../services/centres.service', () => ({
  getCentres:   vi.fn(),
  getUserPlan:  vi.fn(),
}));

import { getCentres, getUserPlan } from '../services/centres.service';

const mockUser    = { id: 'user-1', email: 'test@test.com' };
const mockCentres = [{ id: 'c1', name: "The Adjei's", currency: 'GHS' }];

describe('useCentres', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCentres.mockResolvedValue({ data: mockCentres, error: null });
    getUserPlan.mockResolvedValue({ data: 'free', error: null });
  });

  it('returns empty centres and free plan when no user', async () => {
    const { result } = renderHook(() => useCentres(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.centres).toEqual([]);
    expect(result.current.plan).toBe('free');
  });

  it('loads centres for logged-in user', async () => {
    const { result } = renderHook(() => useCentres(mockUser));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.centres).toEqual(mockCentres);
  });

  it('exposes plan returned by getUserPlan', async () => {
    getUserPlan.mockResolvedValue({ data: 'pro', error: null });
    const { result } = renderHook(() => useCentres(mockUser));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.plan).toBe('pro');
  });

  it('defaults plan to free when getUserPlan fails', async () => {
    getUserPlan.mockResolvedValue({ data: 'free', error: { message: 'plan error' } });
    const { result } = renderHook(() => useCentres(mockUser));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.plan).toBe('free');
  });

  it('sets error when getCentres fails', async () => {
    getCentres.mockResolvedValue({ data: null, error: { message: 'fetch failed' } });
    const { result } = renderHook(() => useCentres(mockUser));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('fetch failed');
  });

  it('starts in loading state', async () => {
    const { result } = renderHook(() => useCentres(mockUser));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('exposes reload function', async () => {
    const { result } = renderHook(() => useCentres(mockUser));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(typeof result.current.reload).toBe('function');
  });
});
