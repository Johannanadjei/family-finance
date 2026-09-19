import { describe, it, expect } from 'vitest';
import { formatDateRange, getCurrentMonth, getToday, isPastMonth, formatMonth } from './dates';

describe('getCurrentMonth', () => {
  it('returns a YYYY-MM string', () => {
    expect(getCurrentMonth()).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe('getToday', () => {
  it('returns a YYYY-MM-DD string', () => {
    expect(getToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('matches the UTC date (and shares the YYYY-MM prefix with getCurrentMonth)', () => {
    expect(getToday()).toBe(new Date().toISOString().slice(0, 10));
    expect(getToday().slice(0, 7)).toBe(getCurrentMonth());
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

describe('formatDateRange', () => {
  it('omits the repeated year within one calendar year', () => {
    expect(formatDateRange('2026-09-01', '2026-09-30')).toBe('1 Sep – 30 Sep 2026');
  });

  it('spans two months in the same year without repeating the year', () => {
    expect(formatDateRange('2026-09-18', '2026-10-18')).toBe('18 Sep – 18 Oct 2026');
  });

  it('shows both years when the range crosses a year boundary', () => {
    expect(formatDateRange('2026-12-18', '2027-01-03')).toBe('18 Dec 2026 – 3 Jan 2027');
  });

  it('strips leading zeros from the day', () => {
    expect(formatDateRange('2026-03-05', '2026-03-09')).toBe('5 Mar – 9 Mar 2026');
  });

  it('returns empty string when either end is missing', () => {
    expect(formatDateRange(null, '2026-09-30')).toBe('');
    expect(formatDateRange('2026-09-01', undefined)).toBe('');
    expect(formatDateRange(undefined, undefined)).toBe('');
  });
});
