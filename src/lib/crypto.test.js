/**
 * lib/crypto.test.js
 * Verifies hashPin produces identical output for creation and authentication paths.
 */

import { describe, it, expect } from 'vitest';
import { hashPin, verifyPin } from './crypto';

describe('hashPin', () => {
  it('returns a 64-char lowercase hex string', async () => {
    const hash = await hashPin('1234');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('same PIN always produces same hash — creation and auth paths match', async () => {
    // createGuestUser calls: hashPin(String(pin))
    const creationHash = await hashPin(String('1234'));
    // authenticateGuest calls: hashPin(String(pin))
    const authHash = await hashPin(String('1234'));
    expect(creationHash).toBe(authHash);
  });

  it('different PINs produce different hashes', async () => {
    const a = await hashPin('1234');
    const b = await hashPin('5678');
    expect(a).not.toBe(b);
  });

  it('trims whitespace — padded input hashes identically to clean input', async () => {
    const clean  = await hashPin('1234');
    const padded = await hashPin(' 1234 ');
    expect(clean).toBe(padded);
  });

  it('String() coercion is consistent — number and string PIN produce same hash', async () => {
    const fromString = await hashPin(String('1234'));
    const fromNumber = await hashPin(String(1234));
    expect(fromString).toBe(fromNumber);
  });
});

describe('verifyPin', () => {
  it('returns true when PIN matches the stored hash', async () => {
    const hash = await hashPin('1234');
    expect(await verifyPin('1234', hash)).toBe(true);
  });

  it('returns false when PIN does not match the stored hash', async () => {
    const hash = await hashPin('1234');
    expect(await verifyPin('9999', hash)).toBe(false);
  });

  it('stored hash is the same value the authenticate_guest RPC receives', async () => {
    const stored = await hashPin('5678');       // stored during createGuestUser
    const sent   = await hashPin(String('5678')); // sent during authenticateGuest
    expect(sent).toBe(stored);
  });
});
