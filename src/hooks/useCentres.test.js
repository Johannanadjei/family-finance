/**
 * hooks/useCentres.test.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor }                  from '@testing-library/react';
import { useCentres }                           from './useCentres';

vi.mock('../services/centres.service', () => ({
  getCentres: vi.fn(),
}));

import { getCentres } from '../services/centres.service';

const mockUser = { id: 'user-1', email: 'test@test.com' };

describe('useCentres', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns empty centres when no user', async () => {
    const { result } = renderHook(() => useCentres(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.centres).toEqual([]);
  });

  it('loads centres for logged in user', async () => {
    const mockCentres = [{ id: 'c1', name: "The Adjei's", currency: 'GHS' }];
    getCentres.mockResolvedValue({ data: mockCentres, error: null });
    const { result } = renderHook(() => useCentres(mockUser));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.centres).toEqual(mockCentres);
  });

  it('sets error when fetch fails', async () => {
    getCentres.mockResolvedValue({ data: null, error: { message: 'fetch failed' } });
    const { result } = renderHook(() => useCentres(mockUser));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('fetch failed');
  });

  it('starts in loading state', () => {
    getCentres.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useCentres(mockUser));
    expect(result.current.loading).toBe(true);
  });

  it('exposes reload function', async () => {
    getCentres.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useCentres(mockUser));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(typeof result.current.reload).toBe('function');
  });
});
