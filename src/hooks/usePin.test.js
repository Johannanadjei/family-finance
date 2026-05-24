/**
 * hooks/usePin.test.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act }              from '@testing-library/react';
import { usePin }                                from './usePin';

vi.mock('../services/pin.service', () => ({
  getPinHash:  vi.fn(),
  savePinHash: vi.fn(),
  clearPinHash: vi.fn(),
}));

vi.mock('../lib/crypto', () => ({
  hashPin:   vi.fn(async (pin) => `hash:${pin}`),
  verifyPin: vi.fn(),
}));

vi.mock('../lib/storage', () => ({
  isPinUnlocked:   vi.fn(() => false),
  savePinUnlocked: vi.fn(),
  clearPinUnlocked: vi.fn(),
  getPinAttempts:  vi.fn(() => 0),
  setPinAttempts:  vi.fn(),
  getLockoutUntil: vi.fn(() => null),
  setLockoutUntil: vi.fn(),
}));

import { getPinHash, savePinHash, clearPinHash } from '../services/pin.service';
import { verifyPin as cryptoVerify }             from '../lib/crypto';
import {
  isPinUnlocked, savePinUnlocked, clearPinUnlocked,
  getPinAttempts, setPinAttempts, getLockoutUntil, setLockoutUntil,
} from '../lib/storage';

const mockUser = { id: 'user-1', email: 'test@test.com' };

describe('usePin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-apply default return values after clearAllMocks (mockReturnValue persists across tests)
    isPinUnlocked.mockReturnValue(false);
    getPinAttempts.mockReturnValue(0);
    getLockoutUntil.mockReturnValue(null);
  });

  it('returns pinLoading true initially', () => {
    getPinHash.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => usePin(mockUser));
    expect(result.current.pinLoading).toBe(true);
  });

  it('returns pinLoading false after load', async () => {
    getPinHash.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => usePin(mockUser));
    await waitFor(() => expect(result.current.pinLoading).toBe(false));
  });

  it('hasPinSetup is false when pin_hash is null', async () => {
    getPinHash.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => usePin(mockUser));
    await waitFor(() => expect(result.current.pinLoading).toBe(false));
    expect(result.current.hasPinSetup).toBe(false);
  });

  it('hasPinSetup is true when pin_hash exists', async () => {
    getPinHash.mockResolvedValue({ data: 'somehash', error: null });
    const { result } = renderHook(() => usePin(mockUser));
    await waitFor(() => expect(result.current.pinLoading).toBe(false));
    expect(result.current.hasPinSetup).toBe(true);
  });

  it('pinUnlocked is false when session flag not set', async () => {
    isPinUnlocked.mockReturnValue(false);
    getPinHash.mockResolvedValue({ data: 'somehash', error: null });
    const { result } = renderHook(() => usePin(mockUser));
    await waitFor(() => expect(result.current.pinLoading).toBe(false));
    expect(result.current.pinUnlocked).toBe(false);
  });

  it('pinUnlocked is true when session flag is set', async () => {
    isPinUnlocked.mockReturnValue(true);
    getPinHash.mockResolvedValue({ data: 'somehash', error: null });
    const { result } = renderHook(() => usePin(mockUser));
    await waitFor(() => expect(result.current.pinLoading).toBe(false));
    expect(result.current.pinUnlocked).toBe(true);
  });

  it('returns empty state when no user', async () => {
    const { result } = renderHook(() => usePin(null));
    await waitFor(() => expect(result.current.pinLoading).toBe(false));
    expect(result.current.hasPinSetup).toBe(false);
    expect(getPinHash).not.toHaveBeenCalled();
  });

  // ── verifyPin ─────────────────────────────────────────────────────────────

  it('verifyPin returns success:true and marks unlocked on correct PIN', async () => {
    getPinHash.mockResolvedValue({ data: 'goodhash', error: null });
    cryptoVerify.mockResolvedValue(true);
    const { result } = renderHook(() => usePin(mockUser));
    await waitFor(() => expect(result.current.pinLoading).toBe(false));
    let res;
    await act(async () => { res = await result.current.verifyPin('1234'); });
    expect(res.success).toBe(true);
    expect(savePinUnlocked).toHaveBeenCalled();
  });

  it('verifyPin returns success:false on wrong PIN', async () => {
    getPinHash.mockResolvedValue({ data: 'goodhash', error: null });
    cryptoVerify.mockResolvedValue(false);
    const { result } = renderHook(() => usePin(mockUser));
    await waitFor(() => expect(result.current.pinLoading).toBe(false));
    let res;
    await act(async () => { res = await result.current.verifyPin('0000'); });
    expect(res.success).toBe(false);
  });

  it('verifyPin increments attempt counter on failure', async () => {
    getPinAttempts.mockReturnValue(0);
    getPinHash.mockResolvedValue({ data: 'goodhash', error: null });
    cryptoVerify.mockResolvedValue(false);
    const { result } = renderHook(() => usePin(mockUser));
    await waitFor(() => expect(result.current.pinLoading).toBe(false));
    await act(async () => { await result.current.verifyPin('0000'); });
    expect(setPinAttempts).toHaveBeenCalledWith(1);
  });

  it('verifyPin sets lockout after 5 failures', async () => {
    getPinAttempts.mockReturnValue(4);
    getPinHash.mockResolvedValue({ data: 'goodhash', error: null });
    cryptoVerify.mockResolvedValue(false);
    const { result } = renderHook(() => usePin(mockUser));
    await waitFor(() => expect(result.current.pinLoading).toBe(false));
    let res;
    await act(async () => { res = await result.current.verifyPin('0000'); });
    expect(res.locked).toBe(true);
    expect(setLockoutUntil).toHaveBeenCalled();
  });

  it('verifyPin returns locked:true when lockedUntil is in the future', async () => {
    getLockoutUntil.mockReturnValue(Date.now() + 60000);
    getPinHash.mockResolvedValue({ data: 'goodhash', error: null });
    cryptoVerify.mockResolvedValue(true);
    const { result } = renderHook(() => usePin(mockUser));
    await waitFor(() => expect(result.current.pinLoading).toBe(false));
    let res;
    await act(async () => { res = await result.current.verifyPin('1234'); });
    expect(res.locked).toBe(true);
    expect(res.success).toBe(false);
  });

  it('verifyPin resets attempts and clears lockout on success', async () => {
    getPinAttempts.mockReturnValue(3);
    getPinHash.mockResolvedValue({ data: 'goodhash', error: null });
    cryptoVerify.mockResolvedValue(true);
    const { result } = renderHook(() => usePin(mockUser));
    await waitFor(() => expect(result.current.pinLoading).toBe(false));
    await act(async () => { await result.current.verifyPin('1234'); });
    expect(setPinAttempts).toHaveBeenCalledWith(0);
    expect(setLockoutUntil).toHaveBeenCalledWith(null);
  });

  // ── setupPin ──────────────────────────────────────────────────────────────

  it('setupPin hashes the PIN and saves to Supabase', async () => {
    getPinHash.mockResolvedValue({ data: null, error: null });
    savePinHash.mockResolvedValue({ error: null });
    const { result } = renderHook(() => usePin(mockUser));
    await waitFor(() => expect(result.current.pinLoading).toBe(false));
    await act(async () => { await result.current.setupPin('5678'); });
    expect(savePinHash).toHaveBeenCalledWith('user-1', 'hash:5678');
  });

  it('setupPin marks session unlocked on success', async () => {
    getPinHash.mockResolvedValue({ data: null, error: null });
    savePinHash.mockResolvedValue({ error: null });
    const { result } = renderHook(() => usePin(mockUser));
    await waitFor(() => expect(result.current.pinLoading).toBe(false));
    await act(async () => { await result.current.setupPin('5678'); });
    expect(savePinUnlocked).toHaveBeenCalled();
  });

  it('setupPin returns { error } on service failure', async () => {
    getPinHash.mockResolvedValue({ data: null, error: null });
    savePinHash.mockResolvedValue({ error: new Error('db error') });
    const { result } = renderHook(() => usePin(mockUser));
    await waitFor(() => expect(result.current.pinLoading).toBe(false));
    let res;
    await act(async () => { res = await result.current.setupPin('1234'); });
    expect(res.error).toBeTruthy();
  });

  // ── removePin ─────────────────────────────────────────────────────────────

  it('removePin calls clearPinHash and clears session', async () => {
    getPinHash.mockResolvedValue({ data: 'somehash', error: null });
    clearPinHash.mockResolvedValue({ error: null });
    const { result } = renderHook(() => usePin(mockUser));
    await waitFor(() => expect(result.current.pinLoading).toBe(false));
    await act(async () => { await result.current.removePin(); });
    expect(clearPinHash).toHaveBeenCalledWith('user-1');
    expect(clearPinUnlocked).toHaveBeenCalled();
  });

  it('removePin returns { error } on service failure', async () => {
    getPinHash.mockResolvedValue({ data: 'somehash', error: null });
    clearPinHash.mockResolvedValue({ error: new Error('db error') });
    const { result } = renderHook(() => usePin(mockUser));
    await waitFor(() => expect(result.current.pinLoading).toBe(false));
    let res;
    await act(async () => { res = await result.current.removePin(); });
    expect(res.error).toBeTruthy();
  });

  it('exposes verifyPin, setupPin, removePin as functions', async () => {
    getPinHash.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => usePin(mockUser));
    await waitFor(() => expect(result.current.pinLoading).toBe(false));
    expect(typeof result.current.verifyPin).toBe('function');
    expect(typeof result.current.setupPin).toBe('function');
    expect(typeof result.current.removePin).toBe('function');
  });
});
