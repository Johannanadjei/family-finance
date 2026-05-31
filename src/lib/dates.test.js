import { describe, it, expect } from 'vitest';
import { getCurrentMonth, isPastMonth } from './dates';

describe('getCurrentMonth', () => {
  it('returns a YYYY-MM string', () => {
    expect(getCurrentMonth()).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe('isPastMonth', () => {
  it('is true for a month before the current one', () => {
    expect(isPastMonth('2000-01')).toBe(true);
  });

  it('is false for the current month', () => {
    expect(isPastMonth(getCurrentMonth())).toBe(false);
  });

  it('is false for a far-future month', () => {
    expect(isPastMonth('2999-12')).toBe(false);
  });

  it('is false for a null/empty month (no crash)', () => {
    expect(isPastMonth(null)).toBe(false);
    expect(isPastMonth(undefined)).toBe(false);
    expect(isPastMonth('')).toBe(false);
  });
});
