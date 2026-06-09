import { describe, it, expect } from 'vitest';
import { getActiveCycle, getCycleContainingDate, getCycleNav, sliceByCycle, cycleIdForMonth, currentCalendarMonthRange, nextCalendarMonthRange, isWithinCurrentYear, visibleCycleWindow } from './cycles';

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
  // Phase 2 (Bug 1): history-independent — always today + 1 calendar month, never
  // anchored on the cycle list. Single `today` arg; stray future cycles are irrelevant.
  it('returns the calendar month after the one containing today', () => {
    expect(nextCalendarMonthRange('2026-06-15')).toEqual({
      start: '2026-07-01', end: '2026-07-31', name: 'July 2026',
    });
  });

  it('is independent of any date within the current month (first/last day)', () => {
    expect(nextCalendarMonthRange('2026-06-01')).toEqual({
      start: '2026-07-01', end: '2026-07-31', name: 'July 2026',
    });
    expect(nextCalendarMonthRange('2026-06-30')).toEqual({
      start: '2026-07-01', end: '2026-07-31', name: 'July 2026',
    });
  });

  it('lands on a 28/29-day February correctly (next month = Feb)', () => {
    expect(nextCalendarMonthRange('2026-01-10')).toEqual({
      start: '2026-02-01', end: '2026-02-28', name: 'February 2026',
    });
    expect(nextCalendarMonthRange('2028-01-10')).toEqual({   // 2028 leap year
      start: '2028-02-01', end: '2028-02-29', name: 'February 2028',
    });
  });

  it('returns null when next month would cross into next year (December)', () => {
    expect(nextCalendarMonthRange('2026-12-01')).toBeNull();
    expect(nextCalendarMonthRange('2026-12-31')).toBeNull();
  });

  it('defaults `today` to UTC today when called with no argument', () => {
    const r = nextCalendarMonthRange();
    // Either a valid range or null (December) — never throws, always shaped right.
    expect(r === null || (typeof r.start === 'string' && typeof r.name === 'string')).toBe(true);
  });
});

describe('isWithinCurrentYear', () => {
  it('is true when both ends share today’s year', () => {
    expect(isWithinCurrentYear('2026-07-01', '2026-07-31', '2026-06-15')).toBe(true);
    expect(isWithinCurrentYear('2026-01-01', '2026-12-31', '2026-06-15')).toBe(true);
  });

  it('is false when the start spills into another year', () => {
    expect(isWithinCurrentYear('2025-12-15', '2026-01-15', '2026-06-15')).toBe(false);
  });

  it('is false when the end spills into next year', () => {
    expect(isWithinCurrentYear('2026-12-15', '2027-01-15', '2026-06-15')).toBe(false);
  });

  it('is false when both ends are in a different year entirely', () => {
    expect(isWithinCurrentYear('2027-03-01', '2027-03-31', '2026-06-15')).toBe(false);
  });

  it('defaults `today` to UTC today when omitted', () => {
    const yr = new Date().toISOString().slice(0, 4);
    expect(isWithinCurrentYear(`${yr}-03-01`, `${yr}-03-31`)).toBe(true);
  });
});

describe('visibleCycleWindow', () => {
  const FEB = { id: 'feb', start_date: '2026-02-01', end_date: '2026-02-28' };
  const MAR = { id: 'mar', start_date: '2026-03-01', end_date: '2026-03-31' };
  const five = [FEB, MAR, APR, MAY, JUN];   // chronological

  it('returns [] for an empty array', () => {
    expect(visibleCycleWindow([], 3)).toEqual([]);
  });

  it('returns all (sorted newest-first) when count < limit', () => {
    expect(visibleCycleWindow([APR, MAY], 3).map(c => c.id)).toEqual(['may', 'apr']);
  });

  it('returns all when count === limit', () => {
    expect(visibleCycleWindow([APR, MAY, JUN], 3).map(c => c.id)).toEqual(['jun', 'may', 'apr']);
  });

  it('returns the newest N when count > limit', () => {
    // 5 cycles, limit 3 → the three newest (Jun, May, Apr); Feb + Mar hidden.
    expect(visibleCycleWindow(five, 3).map(c => c.id)).toEqual(['jun', 'may', 'apr']);
  });

  it('returns all cycles when limit is Infinity (Pro)', () => {
    expect(visibleCycleWindow(five, Infinity).map(c => c.id)).toEqual(['jun', 'may', 'apr', 'mar', 'feb']);
  });

  it('is order-independent — windows the newest N regardless of input order', () => {
    const shuffled = [MAY, FEB, JUN, APR, MAR];
    expect(visibleCycleWindow(shuffled, 3).map(c => c.id)).toEqual(['jun', 'may', 'apr']);
  });

  it('does not mutate the input array', () => {
    const input = [MAY, FEB, JUN];
    const copy  = [...input];
    visibleCycleWindow(input, 2);
    expect(input).toEqual(copy);
  });
});
