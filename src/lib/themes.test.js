import { describe, it, expect } from 'vitest';
import { resolveSkin } from './themes';

describe('resolveSkin', () => {
  it('standard role always returns family_warmth regardless of centre skin', () => {
    expect(resolveSkin('standard', 'dark_executive', 'corporate_professional')).toBe('family_warmth');
  });

  it('standard role returns family_warmth even when centre and pref are absent', () => {
    expect(resolveSkin('standard', null, null)).toBe('family_warmth');
  });

  it('full_access (pro) uses centre skin_id when present', () => {
    expect(resolveSkin('full_access', 'dark_executive', 'sunset_warm', 'pro')).toBe('dark_executive');
  });

  it('owner (pro) uses centre skin_id when present', () => {
    expect(resolveSkin('owner', 'royal_luxury', null, 'pro')).toBe('royal_luxury');
  });

  it('falls back to pref when centre skin is absent (pro)', () => {
    expect(resolveSkin('full_access', null, 'sunset_warm', 'pro')).toBe('sunset_warm');
  });

  it('falls back to pref when centre skin is empty string (pro)', () => {
    expect(resolveSkin('owner', '', 'neon_futuristic', 'pro')).toBe('neon_futuristic');
  });

  it('falls back to family_warmth when both centre skin and pref are absent', () => {
    expect(resolveSkin('owner', null, null)).toBe('family_warmth');
  });

  it('falls back to family_warmth when both centre skin and pref are empty strings', () => {
    expect(resolveSkin('full_access', '', '')).toBe('family_warmth');
  });

  // ── Downgrade clamp (D2) — a non-Pro user never renders a Pro skin ──
  it('free user with a Pro centre skin clamps to family_warmth (non-destructive)', () => {
    expect(resolveSkin('owner', 'royal_luxury', null, 'free')).toBe('family_warmth');
  });

  it('free user with a Pro PREF skin (centre absent) clamps to family_warmth', () => {
    expect(resolveSkin('full_access', null, 'neon_futuristic', 'free')).toBe('family_warmth');
  });

  it('free user with the free skin keeps it', () => {
    expect(resolveSkin('owner', 'family_warmth', null, 'free')).toBe('family_warmth');
  });

  it('userPlan defaults to free → Pro centre skin clamps when plan omitted', () => {
    expect(resolveSkin('owner', 'dark_executive', null)).toBe('family_warmth');
  });

  it('re-upgrade restores: same Pro centre skin renders once plan is pro', () => {
    expect(resolveSkin('owner', 'royal_luxury', null, 'pro')).toBe('royal_luxury');
  });
});
