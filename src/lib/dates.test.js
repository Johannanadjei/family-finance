import { describe, it, expect } from 'vitest';
import { getCurrentMonth, isPastMonth, formatMonth } from './dates';

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

describe('formatMonth', () => {
  it('formats a mid-year month', () => {
    expect(formatMonth('2026-05')).toBe('May 2026');
  });

  it('formats December', () => {
    expect(formatMonth('2025-12')).toBe('December 2025');
  });

  it('formats January', () => {
    expect(formatMonth('2026-01')).toBe('January 2026');
  });

  // Documents the preserved (surprising) edge-case behaviour: bad input is
  // silently coerced to "January 2001" rather than throwing or "Invalid Date".
  // Backlog: add a defensive guard if i18n lands or production input is exposed.
  it('coerces bad input to "January 2001" rather than throwing', () => {
    expect(formatMonth(null)).toBe('January 2001');
  });
});
