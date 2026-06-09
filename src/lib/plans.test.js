import { describe, it, expect } from 'vitest';
import { FREE_SKIN_IDS, isProSkin, getLimitsForTier, FREE_LIMITS, PRO_LIMITS } from './plans';

describe('plans — skin entitlements', () => {
  it('family_warmth is a free skin', () => {
    expect(FREE_SKIN_IDS).toContain('family_warmth');
    expect(isProSkin('family_warmth')).toBe(false);
  });

  it('any non-free skin is Pro', () => {
    expect(isProSkin('royal_luxury')).toBe(true);
    expect(isProSkin('neon_futuristic')).toBe(true);
    expect(isProSkin('panda')).toBe(true);
  });

  it('null / undefined / empty are NOT Pro (clamp leaves them alone)', () => {
    expect(isProSkin(null)).toBe(false);
    expect(isProSkin(undefined)).toBe(false);
    expect(isProSkin('')).toBe(false);
  });
});

describe('plans — getLimitsForTier (allowAllSkins entitlement)', () => {
  it('free tier disallows all skins', () => {
    expect(getLimitsForTier('free').allowAllSkins).toBe(false);
    expect(getLimitsForTier('free')).toBe(FREE_LIMITS);
  });

  it('pro tier allows all skins', () => {
    expect(getLimitsForTier('pro').allowAllSkins).toBe(true);
    expect(getLimitsForTier('pro')).toBe(PRO_LIMITS);
  });

  it('unknown tier falls back to free', () => {
    expect(getLimitsForTier('mystery')).toBe(FREE_LIMITS);
  });
});
