import { describe, it, expect } from 'vitest';
import { getActiveCycle, getCycleContainingDate } from './cycles';

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
