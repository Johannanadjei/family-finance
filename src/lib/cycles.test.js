import { describe, it, expect } from 'vitest';
import { getActiveCycle, getCycleContainingDate, getCycleNav, sliceByCycle, cycleIdForMonth, currentCalendarMonthRange, nextCalendarMonthRange } from './cycles';

// Three non-overlapping calendar cycles. Dates are 'YYYY-MM-DD' strings.
const APR = { id: 'apr', start_date: '2026-04-01', end_date: '2026-04-30', deleted_at: null };
const MAY = { id: 'may', start_date: '2026-05-01', end_date: '2026-05-31', deleted_at: null };
const JUN = { id: 'jun', start_date: '2026-06-01', end_date: '2026-06-30', deleted_at: null };

describe('getActiveCycle', () => {
  it('returns the cycle containing today when one matches', () => {
    expect(getActiveCycle([APR, MAY, JUN], '2026-05-15')).toBe(MAY);
  });

  it('returns the cycle on its start/end boundary (inclusive)', () => {
    expect(getActiveCycle([APR, MAY, JUN], '2026-05-01')).toBe(MAY);
    expect(getActiveCycle([APR, MAY, JUN], '2026-05-31')).toBe(MAY);
  });

  it('returns the most recently ended cycle on a gap day', () => {
    // today is after JUN ended — no cycle contains it
    expect(getActiveCycle([APR, MAY, JUN], '2026-07-10')).toBe(JUN);
  });

  it('returns the earliest future cycle when all cycles are ahead (brand-new hub)', () => {
    expect(getActiveCycle([MAY, JUN], '2026-03-01')).toBe(MAY);
  });

  it('returns null when there are no cycles', () => {
    expect(getActiveCycle([], '2026-05-15')).toBeNull();
  });

  it('ignores soft-deleted cycles', () => {
    const deletedMay = { ...MAY, deleted_at: '2026-05-02T00:00:00Z' };
    // today is in May, but the only May cycle is deleted → falls back to nearest past (APR)
    expect(getActiveCycle([APR, deletedMay], '2026-05-15')).toBe(APR);
  });
});

describe('getCycleContainingDate', () => {
  it('returns the cycle whose range contains the date', () => {
    expect(getCycleContainingDate([APR, MAY, JUN], '2026-06-15')).toBe(JUN);
  });

  it('returns null when the date falls in a gap (no cycle covers it)', () => {
    expect(getCycleContainingDate([APR, JUN], '2026-05-15')).toBeNull();
  });

  it('ignores soft-deleted cycles', () => {
    const deletedJun = { ...JUN, deleted_at: '2026-06-02T00:00:00Z' };
    expect(getCycleContainingDate([deletedJun], '2026-06-15')).toBeNull();
  });
});

describe('getCycleNav', () => {
  // Pass DESC (as the service returns) to also prove order-independence via the sort.
  const LIST = [JUN, MAY, APR];

  it('returns older/newer neighbours for a middle cycle', () => {
    const nav = getCycleNav(LIST, 'may');
    expect(nav.current).toBe(MAY);
    expect(nav.next).toBe(JUN);    // newer
    expect(nav.prev).toBe(APR);    // older
    expect(nav.isLatest).toBe(false);
    expect(nav.isOldest).toBe(false);
  });

  it('flags isLatest with no newer cycle at the front', () => {
    const nav = getCycleNav(LIST, 'jun');
    expect(nav.next).toBeNull();
    expect(nav.prev).toBe(MAY);
    expect(nav.isLatest).toBe(true);
    expect(nav.isOldest).toBe(false);
  });

  it('flags isOldest with no older cycle at the end', () => {
    const nav = getCycleNav(LIST, 'apr');
    expect(nav.prev).toBeNull();
    expect(nav.next).toBe(MAY);
    expect(nav.isLatest).toBe(false);
    expect(nav.isOldest).toBe(true);
  });

  it('returns all-null and both ends flagged for an unknown id', () => {
    const nav = getCycleNav(LIST, 'nope');
    expect(nav.current).toBeNull();
    expect(nav.prev).toBeNull();
    expect(nav.next).toBeNull();
    expect(nav.isLatest).toBe(true);
    expect(nav.isOldest).toBe(true);
  });

  it('handles an empty list (nav fully disabled)', () => {
    const nav = getCycleNav([], null);
    expect(nav.current).toBeNull();
    expect(nav.isLatest).toBe(true);
    expect(nav.isOldest).toBe(true);
  });
});

describe('sliceByCycle', () => {
  const ROWS = [
    { id: 'a', cycle_id: 'may' },
    { id: 'b', cycle_id: 'may' },
    { id: 'c', cycle_id: 'jun' },
    { id: 'd', cycle_id: null },
  ];

  it('returns only the rows matching the cycle id', () => {
    expect(sliceByCycle(ROWS, 'may').map(r => r.id)).toEqual(['a', 'b']);
  });

  it('returns [] for a falsy cycleId — never matching null cycle_id rows', () => {
    expect(sliceByCycle(ROWS, null)).toEqual([]);
    expect(sliceByCycle(ROWS, undefined)).toEqual([]);
  });
});

describe('cycleIdForMonth', () => {
  it('returns the id of the cycle whose start-month matches (trigger parity)', () => {
    expect(cycleIdForMonth([APR, MAY, JUN], '2026-05')).toBe('may');
  });

  it('returns null when no live cycle covers the month', () => {
    expect(cycleIdForMonth([APR, JUN], '2026-05')).toBeNull();
  });

  it('ignores soft-deleted cycles', () => {
    const deletedMay = { ...MAY, deleted_at: '2026-05-02T00:00:00Z' };
    expect(cycleIdForMonth([deletedMay], '2026-05')).toBeNull();
  });
});

describe('currentCalendarMonthRange', () => {
  it('returns the full calendar month containing today (mid-month)', () => {
    expect(currentCalendarMonthRange('2026-06-28')).toEqual({
      start: '2026-06-01', end: '2026-06-30', name: 'June 2026',
    });
  });

  it('handles a 31-day month', () => {
    expect(currentCalendarMonthRange('2026-07-15')).toEqual({
      start: '2026-07-01', end: '2026-07-31', name: 'July 2026',
    });
  });

  it('handles February in a non-leap year (28 days)', () => {
    expect(currentCalendarMonthRange('2026-02-10')).toEqual({
      start: '2026-02-01', end: '2026-02-28', name: 'February 2026',
    });
  });

  it('handles February in a leap year (29 days)', () => {
    expect(currentCalendarMonthRange('2028-02-10')).toEqual({
      start: '2028-02-01', end: '2028-02-29', name: 'February 2028',
    });
  });

  it('works on the first and last day of a month', () => {
    expect(currentCalendarMonthRange('2026-12-01').start).toBe('2026-12-01');
    expect(currentCalendarMonthRange('2026-12-31')).toEqual({
      start: '2026-12-01', end: '2026-12-31', name: 'December 2026',
    });
  });
});

describe('nextCalendarMonthRange', () => {
  it('falls back to the current calendar month when there are no cycles', () => {
    expect(nextCalendarMonthRange([], '2026-06-10')).toEqual({
      start: '2026-06-01', end: '2026-06-30', name: 'June 2026',
    });
  });

  it('starts the day after the latest cycle ends (calendar-aligned → next month)', () => {
    expect(nextCalendarMonthRange([APR, MAY, JUN], '2026-06-15')).toEqual({
      start: '2026-07-01', end: '2026-07-31', name: 'July 2026',
    });
  });

  it('rolls Dec → Jan across the year boundary', () => {
    const DEC = { id: 'dec', start_date: '2026-12-01', end_date: '2026-12-31', deleted_at: null };
    expect(nextCalendarMonthRange([DEC], '2026-12-20')).toEqual({
      start: '2027-01-01', end: '2027-01-31', name: 'January 2027',
    });
  });

  it('uses the latest end across an unsorted list and ignores soft-deleted cycles', () => {
    const deletedJul = { id: 'jul', start_date: '2026-07-01', end_date: '2026-07-31', deleted_at: '2026-07-02T00:00:00Z' };
    // live latest is JUN (ends 06-30); the deleted Jul must not win
    expect(nextCalendarMonthRange([MAY, deletedJul, JUN, APR], '2026-06-15').start).toBe('2026-07-01');
  });

  it('starts the day after a mid-month custom period end (rest of that month)', () => {
    const CUSTOM = { id: 'c', start_date: '2026-08-01', end_date: '2026-08-15', deleted_at: null };
    expect(nextCalendarMonthRange([CUSTOM], '2026-08-10')).toEqual({
      start: '2026-08-16', end: '2026-08-31', name: 'August 2026',
    });
  });
});
