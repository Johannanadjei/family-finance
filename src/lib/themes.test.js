import { describe, it, expect } from 'vitest';
import { resolveSkin } from './themes';

describe('resolveSkin', () => {
  it('standard role always returns family_warmth regardless of centre skin', () => {
    expect(resolveSkin('standard', 'dark_executive', 'corporate_professional')).toBe('family_warmth');
  });

  it('standard role returns family_warmth even when centre and pref are absent', () => {
    expect(resolveSkin('standard', null, null)).toBe('family_warmth');
  });

  it('full_access uses centre skin_id when present', () => {
    expect(resolveSkin('full_access', 'dark_executive', 'sunset_warm')).toBe('dark_executive');
  });

  it('owner uses centre skin_id when present', () => {
    expect(resolveSkin('owner', 'royal_luxury', null)).toBe('royal_luxury');
  });

  it('falls back to pref when centre skin is absent', () => {
    expect(resolveSkin('full_access', null, 'sunset_warm')).toBe('sunset_warm');
  });

  it('falls back to pref when centre skin is empty string', () => {
    expect(resolveSkin('owner', '', 'neon_futuristic')).toBe('neon_futuristic');
  });

  it('falls back to family_warmth when both centre skin and pref are absent', () => {
    expect(resolveSkin('owner', null, null)).toBe('family_warmth');
  });

  it('falls back to family_warmth when both centre skin and pref are empty strings', () => {
    expect(resolveSkin('full_access', '', '')).toBe('family_warmth');
  });
});
