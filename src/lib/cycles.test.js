import { describe, it, expect } from 'vitest';
import { getActiveCycle, getCycleContainingDate, getCycleNav, sliceByCycle, cycleIdForMonth,
         anchorToDateRange, cycleDefaultName, computeNextCycleParams } from './cycles';

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

// ── Anchor-aware boundaries (Commit 14b) ───────────────────────────────────────
describe('anchorToDateRange', () => {
  it('calendar — the whole calendar month containing the reference date', () => {
    expect(anchorToDateRange('calendar', null, '2026-06-15'))
      .toEqual({ start_date: '2026-06-01', end_date: '2026-06-30' });
  });

  it('fixed_day — anchor day to the day before next month\'s anchor', () => {
    // reference on the anchor day starts the cycle there
    expect(anchorToDateRange('fixed_day', 29, '2026-05-29'))
      .toEqual({ start_date: '2026-05-29', end_date: '2026-06-28' });
    // reference before this month's anchor belongs to the previous window
    expect(anchorToDateRange('fixed_day', 29, '2026-06-15'))
      .toEqual({ start_date: '2026-05-29', end_date: '2026-06-28' });
  });

  it('fixed_day 31 clamps to the short month (Feb 28, non-leap)', () => {
    expect(anchorToDateRange('fixed_day', 31, '2026-02-10'))
      .toEqual({ start_date: '2026-01-31', end_date: '2026-02-27' });
  });

  it('fixed_day 31 clamps to Feb 29 in a leap year', () => {
    expect(anchorToDateRange('fixed_day', 31, '2028-02-10'))
      .toEqual({ start_date: '2028-01-31', end_date: '2028-02-28' });
  });

  it('last_working_day — anchors to the last weekday of the month', () => {
    // May 2026: 31st is a Sunday → last working day is Fri May 29
    expect(anchorToDateRange('last_working_day', null, '2026-05-15'))
      .toEqual({ start_date: '2026-04-30', end_date: '2026-05-28' });
  });

  it('last_working_day in February — last weekday', () => {
    // Feb 2026: 28th is a Saturday → last working day is Fri Feb 27
    expect(anchorToDateRange('last_working_day', null, '2026-02-15'))
      .toEqual({ start_date: '2026-01-30', end_date: '2026-02-26' });
  });

  it('last_day_of_month — anchors to the final calendar day', () => {
    expect(anchorToDateRange('last_day_of_month', null, '2026-05-15'))
      .toEqual({ start_date: '2026-04-30', end_date: '2026-05-30' });
  });

  it('forward-only clamp — start never reaches back over the previous cycle', () => {
    // fixed_day 29, reference Jul 1, prev cycle ended Jun 30: raw start would be
    // Jun 29 → clamped forward to Jul 1 (a short transition cycle, M1).
    expect(anchorToDateRange('fixed_day', 29, '2026-07-01', '2026-06-30'))
      .toEqual({ start_date: '2026-07-01', end_date: '2026-07-28' });
  });

  it('no clamp applied when the anchor start is already past the previous end', () => {
    expect(anchorToDateRange('fixed_day', 29, '2026-06-29', '2026-06-28'))
      .toEqual({ start_date: '2026-06-29', end_date: '2026-07-28' });
  });

  // Dual-basis regression (CYC03): a stale client reference can point INTO an
  // already-covered period (referenceDate < prevEnd+1). The effective reference must
  // roll the whole range forward to the next free period — never invert start > end.
  it('rolls a stale calendar reference forward instead of inverting the range', () => {
    expect(anchorToDateRange('calendar', null, '2026-06-01', '2026-06-30'))
      .toEqual({ start_date: '2026-07-01', end_date: '2026-07-31' });
  });

  it('rolls a stale fixed_day reference forward instead of inverting the range', () => {
    expect(anchorToDateRange('fixed_day', 29, '2026-06-01', '2026-06-30'))
      .toEqual({ start_date: '2026-07-01', end_date: '2026-07-28' });
  });
});

describe('cycleDefaultName', () => {
  it('majority month wins (May 29 – Jun 28 → June)', () => {
    expect(cycleDefaultName('2026-05-29', '2026-06-28')).toBe('June 2026');
  });

  it('calendar month names itself', () => {
    expect(cycleDefaultName('2026-06-01', '2026-06-30')).toBe('June 2026');
  });

  it('ties break toward the later month (15 days each → July)', () => {
    expect(cycleDefaultName('2026-06-16', '2026-07-15')).toBe('July 2026');
  });
});

describe('computeNextCycleParams', () => {
  it('brand-new hub (no prev cycle) uses today as the reference date', () => {
    const p = computeNextCycleParams({ cycle_anchor_type: 'calendar' }, null, '2026-06-03');
    expect(p.reference_date).toBe('2026-06-03');
    expect(p.start_date).toBe('2026-06-01');
    expect(p.end_date).toBe('2026-06-30');
    expect(p.anchor_type).toBe('calendar');
    expect(p.anchor_day).toBeNull();
    expect(p.name).toBe('June 2026');
  });

  it('existing hub uses prev.end_date + 1 as the reference date', () => {
    const p = computeNextCycleParams(
      { cycle_anchor_type: 'fixed_day', cycle_anchor_day: 25 },
      { end_date: '2026-06-24' },
      '2026-06-03',
    );
    expect(p.reference_date).toBe('2026-06-25');
    expect(p.anchor_type).toBe('fixed_day');
    expect(p.anchor_day).toBe(25);
    expect(p.start_date).toBe('2026-06-25');
    expect(p.end_date).toBe('2026-07-24');
  });

  it('defaults to calendar anchor when the hub has none set', () => {
    const p = computeNextCycleParams({}, null, '2026-06-03');
    expect(p.anchor_type).toBe('calendar');
    expect(p.anchor_day).toBeNull();
  });

  it('drops a stray anchor_day for non-fixed_day anchors', () => {
    const p = computeNextCycleParams({ cycle_anchor_type: 'last_working_day', cycle_anchor_day: 25 }, null, '2026-06-03');
    expect(p.anchor_day).toBeNull();
  });
});
