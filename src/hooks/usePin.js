/**
 * hooks/usePin.js
 *
 * Owns all PIN state: loading, setup status, lockout, attempt counting.
 * Verification is done client-side via lib/crypto.js — raw PIN never sent to DB.
 */

import { useState, useEffect, useCallback } from 'react';
import { getPinHash, savePinHash, clearPinHash } from '../services/pin.service';
import { hashPin, verifyPin as cryptoVerify }    from '../lib/crypto';
import {
  isPinUnlocked, savePinUnlocked, clearPinUnlocked,
  getPinAttempts, setPinAttempts,
  getLockoutUntil, setLockoutUntil,
} from '../lib/storage';

const MAX_ATTEMPTS   = 5;
const BASE_LOCKOUT   = 5 * 60 * 1000;   // 5 min in ms
const MAX_LOCKOUT    = 60 * 60 * 1000;  // 60 min cap

function computeLockoutMs(attemptsSinceLock) {
  const doublings = Math.max(0, attemptsSinceLock - 1);
  return Math.min(BASE_LOCKOUT * Math.pow(2, doublings), MAX_LOCKOUT);
}

export function usePin(user) {
  const [pinHash,    setPinHash]    = useState(null);
  const [pinLoading, setPinLoading] = useState(true);
  const [pinUnlocked, setPinUnlocked] = useState(() => isPinUnlocked());
  const [attempts,   setAttempts]   = useState(() => getPinAttempts());
  const [lockedUntil, setLockedUntil] = useState(() => getLockoutUntil());

  // Load pin_hash from Supabase on mount / user change
  useEffect(() => {
    if (!user) { setPinLoading(false); setPinHash(null); return; }
    let cancelled = false;
    setPinLoading(true);
    getPinHash(user.id).then(({ data }) => {
      if (!cancelled) { setPinHash(data); setPinLoading(false); }
    });
    return () => { cancelled = true; };
  }, [user?.id]);

  const hasPinSetup = pinHash !== null && !pinLoading;

  /** Verify the entered PIN. Handles lockout and attempt counting. */
  const verifyPin = useCallback(async (pin) => {
    const now = Date.now();
    if (lockedUntil && now < lockedUntil) {
      return { success: false, locked: true, lockedUntil };
    }

    const ok = await cryptoVerify(pin, pinHash);

    if (ok) {
      setPinAttempts(0);
      setAttempts(0);
      setLockoutUntil(null);
      setLockedUntil(null);
      savePinUnlocked();
      setPinUnlocked(true);
      return { success: true };
    }

    const next = attempts + 1;
    setPinAttempts(next);
    setAttempts(next);

    if (next >= MAX_ATTEMPTS) {
      // Determine which lockout period this is (how many times we've locked out)
      // Use integer division: each lockout consumes MAX_ATTEMPTS attempts
      const lockoutCount = Math.floor(next / MAX_ATTEMPTS);
      const lockMs = computeLockoutMs(lockoutCount);
      const until = Date.now() + lockMs;
      setLockoutUntil(until);
      setLockedUntil(until);
      return { success: false, locked: true, lockedUntil: until, attemptsLeft: 0 };
    }

    return { success: false, locked: false, attemptsLeft: MAX_ATTEMPTS - next };
  }, [pinHash, attempts, lockedUntil]);

  /** Hash and save a new PIN. Marks session as unlocked. */
  const setupPin = useCallback(async (pin) => {
    if (!user) return { error: new Error('Not authenticated') };
    const hash = await hashPin(pin);
    const { error } = await savePinHash(user.id, hash);
    if (!error) {
      setPinHash(hash);
      savePinUnlocked();
      setPinUnlocked(true);
    }
    return { error };
  }, [user]);

  /** Remove the PIN entirely. */
  const removePin = useCallback(async () => {
    if (!user) return { error: new Error('Not authenticated') };
    const { error } = await clearPinHash(user.id);
    if (!error) {
      setPinHash(null);
      clearPinUnlocked();
      setPinUnlocked(false);
      setPinAttempts(0);
      setAttempts(0);
      setLockoutUntil(null);
      setLockedUntil(null);
    }
    return { error };
  }, [user]);

  return {
    hasPinSetup,
    pinLoading,
    pinUnlocked,
    attempts,
    lockedUntil,
    verifyPin,
    setupPin,
    removePin,
  };
}
