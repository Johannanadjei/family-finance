/**
 * hooks/useCentres.test.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor }                  from '@testing-library/react';
import { useCentres }                           from './useCentres';

vi.mock('../lib/auth', () => ({
  waitForSession: vi.fn().mockResolvedValue({ data: { session: { expires_at: 9999999999 } }, error: null }),
  warnOnEmptyColdLoad: vi.fn(),
  sessionAgeMs: vi.fn(() => 0),
}));

vi.mock('../services/centres.service', () => ({
  getCentres:         vi.fn(),
  getArchivedCentres: vi.fn(),
}));

import { getCentres, getArchivedCentres } from '../services/centres.service';

const mockUser    = { id: 'user-1', email: 'test@test.com' };
const mockCentres = [{ id: 'c1', name: "The Adjei's", currency: 'GHS' }];
const mockArchived = [{ id: 'a1', name: 'Old Flat', currency: 'GHS', is_archived: true }];

describe('useCentres', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCentres.mockResolvedValue({ data: mockCentres, error: null });
    getArchivedCentres.mockResolvedValue({ data: mockArchived, error: null });
  });

  it('returns empty centres when no user', async () => {
    const { result } = renderHook(() => useCentres(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.centres).toEqual([]);
    expect(result.current.archivedCentres).toEqual([]);
  });

  it('loads centres for logged-in user', async () => {
    const { result } = renderHook(() => useCentres(mockUser));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.centres).toEqual(mockCentres);
  });

  it('loads archivedCentres for logged-in user', async () => {
    const { result } = renderHook(() => useCentres(mockUser));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.archivedCentres).toEqual(mockArchived);
  });

  it('exposes empty archivedCentres when getArchivedCentres returns empty', async () => {
    getArchivedCentres.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useCentres(mockUser));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.archivedCentres).toEqual([]);
  });

  it('returns empty archivedCentres on getArchivedCentres error (no crash)', async () => {
    getArchivedCentres.mockResolvedValue({ data: null, error: { message: 'archived fetch failed' } });
    const { result } = renderHook(() => useCentres(mockUser));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.archivedCentres).toEqual([]);
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
