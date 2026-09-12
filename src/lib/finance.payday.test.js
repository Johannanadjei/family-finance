/**
 * lib/finance.payday.test.js
 *
 * The pay-date family: resolvePayDate and everything composed from it (calcDaysUntil,
 * fmtNextPayDate, getIncomeStatus, pickNextUnpaid). Split out of finance.test.js, which
 * sits at the 600-line audit cap.
 *
 * These four used to answer the same question independently and disagree — the badge
 * said "Flexible" while the subtitle beneath it said "Last working day" — because each
 * keyed off `pay_day`, which is NULL for a last-working-day source. They now all resolve
 * through one primitive, and the period (not the wall clock) is the frame.
 */

import { describe, it, expect } from 'vitest';
import {
  resolvePayDate,
  calcDaysUntil,
  fmtNextPayDate,
  getIncomeStatus,
  pickNextUnpaid,
} from './finance';

const makeIncome = (overrides = {}) => ({
  id:              'inc-1',
  label:           'Salary',
  expected_amount: 5000,
  received:        false,
  received_amount: 0,
  pay_day:         25,
  pay_day_type:    'fixed_date',
  ...overrides,
});

// ── resolvePayDate ────────────────────────────────────────────────────────────
// The pure primitive every pay-day question now resolves through. The PERIOD is the
// frame, not the wall clock.

const SEP      = { start_date: '2026-09-01', end_date: '2026-09-30' };   // ends Wed
const OCT      = { start_date: '2026-10-01', end_date: '2026-10-31' };   // ends SATURDAY
const MAY      = { start_date: '2026-05-01', end_date: '2026-05-31' };   // ends SUNDAY
const NOV      = { start_date: '2026-11-01', end_date: '2026-11-30' };   // ends Mon
const STRADDLE = { start_date: '2026-09-15', end_date: '2026-10-14' };   // ends Wed
const SHORT    = { start_date: '2026-09-01', end_date: '2026-09-10' };

const fixed    = (day) => makeIncome({ pay_day: day,  pay_day_type: 'fixed_date' });
const lastWork = ()    => makeIncome({ pay_day: null, pay_day_type: 'last_working_day' });
const flexible = ()    => makeIncome({ pay_day: null, pay_day_type: 'flexible' });

describe('resolvePayDate — fixed_date', () => {
  it('resolves day N inside a calendar-month period', () =>
    expect(resolvePayDate(fixed(25), SEP)).toBe('2026-09-25'));

  it('resolves to the FIRST matching day inside a straddling period', () =>
    expect(resolvePayDate(fixed(25), STRADDLE)).toBe('2026-09-25'));

  // The case the clock-anchored version got wrong: day 5 is before this period opens,
  // so the pay date is in the period's SECOND month.
  it('rolls into the period’s second month when day N is before it opens', () =>
    expect(resolvePayDate(fixed(5), STRADDLE)).toBe('2026-10-05'));

  it('clamps the 31st to the last day of a 30-day month', () => {
    expect(resolvePayDate(fixed(31), SEP)).toBe('2026-09-30');
    expect(resolvePayDate(fixed(31), OCT)).toBe('2026-10-31');   // 31 exists here
  });

  it('clamps to the end of February', () =>
    expect(resolvePayDate(fixed(31), { start_date: '2026-02-01', end_date: '2026-02-28' })).toBe('2026-02-28'));

  it('returns null when the period contains no such day', () =>
    expect(resolvePayDate(fixed(25), SHORT)).toBeNull());

  it('returns null when fixed_date carries no day', () =>
    expect(resolvePayDate(makeIncome({ pay_day: null, pay_day_type: 'fixed_date' }), SEP)).toBeNull());

  it('resolves on both boundaries of the period', () => {
    expect(resolvePayDate(fixed(1),  SEP)).toBe('2026-09-01');
    expect(resolvePayDate(fixed(30), SEP)).toBe('2026-09-30');
  });
});

describe('resolvePayDate — last_working_day', () => {
  it('is the period end when it is a weekday', () =>
    expect(resolvePayDate(lastWork(), SEP)).toBe('2026-09-30'));      // Wed

  it('walks back off a SATURDAY month end to the Friday', () =>
    expect(resolvePayDate(lastWork(), OCT)).toBe('2026-10-30'));      // Sat 31 → Fri 30

  it('walks back off a SUNDAY month end to the Friday', () =>
    expect(resolvePayDate(lastWork(), MAY)).toBe('2026-05-29'));      // Sun 31 → Fri 29

  it('stays put on a Monday month end', () =>
    expect(resolvePayDate(lastWork(), NOV)).toBe('2026-11-30'));      // Mon

  // The period end IS the pay cycle's close, so a custom range pays on its own last
  // working day, not the calendar month's.
  it('uses the period end, not the calendar month end, for a custom range', () =>
    expect(resolvePayDate(lastWork(), STRADDLE)).toBe('2026-10-14'));

  it('returns null for a period made entirely of weekend days', () =>
    expect(resolvePayDate(lastWork(), { start_date: '2026-10-31', end_date: '2026-11-01' })).toBeNull());
});

describe('resolvePayDate — flexible', () => {
  it('never resolves a date', () => {
    expect(resolvePayDate(flexible(), SEP)).toBeNull();
    expect(resolvePayDate(flexible(), STRADDLE)).toBeNull();
  });

  it('is distinct from last_working_day, which now DOES resolve', () => {
    expect(resolvePayDate(flexible(), OCT)).toBeNull();
    expect(resolvePayDate(lastWork(), OCT)).not.toBeNull();
  });
});

describe('resolvePayDate — no period', () => {
  it('falls back to the calendar month containing today without throwing', () => {
    const d = resolvePayDate(fixed(15), null);
    expect(d).toMatch(/^\d{4}-\d{2}-15$/);
  });

  it('returns null for a missing source', () =>
    expect(resolvePayDate(null, SEP)).toBeNull());
});

// ── calcDaysUntil ─────────────────────────────────────────────────────────────

describe('calcDaysUntil', () => {
  // BUG-4 REGRESSION. The old implementation compared a midnight target against the
  // current INSTANT, so on the actual payday it rolled to next month and returned ~30.
  // "Today! 🎉" was unreachable for the life of that code.
  it('is exactly 0 on the pay day itself', () =>
    expect(calcDaysUntil(fixed(25), SEP, '2026-09-25')).toBe(0));

  it('counts whole days forward', () => {
    expect(calcDaysUntil(fixed(25), SEP, '2026-09-24')).toBe(1);
    expect(calcDaysUntil(fixed(25), SEP, '2026-09-18')).toBe(7);
  });

  it('goes negative once the pay day has passed', () =>
    expect(calcDaysUntil(fixed(25), SEP, '2026-09-28')).toBe(-3));

  it('counts to the resolved last working day, not to nothing', () =>
    expect(calcDaysUntil(lastWork(), OCT, '2026-10-28')).toBe(2));      // → Fri 30 Oct

  it('is null for a flexible source', () =>
    expect(calcDaysUntil(flexible(), SEP, '2026-09-01')).toBeNull());

  it('is null when the period holds no pay day', () =>
    expect(calcDaysUntil(fixed(25), SHORT, '2026-09-01')).toBeNull());
});

// ── fmtNextPayDate ────────────────────────────────────────────────────────────

describe('fmtNextPayDate', () => {
  it('formats a fixed pay date', () =>
    expect(fmtNextPayDate(fixed(25), SEP)).toBe('25 Sept 2026'));

  // It used to return the literal 'Last working day' — a SCHEDULE label, not a date,
  // which is why wiring it up would not have fixed anything.
  it('formats a real date for last_working_day', () =>
    expect(fmtNextPayDate(lastWork(), OCT)).toBe('30 Oct 2026'));

  it('says Flexible only when there genuinely is no date', () => {
    expect(fmtNextPayDate(flexible(), SEP)).toBe('Flexible');
    expect(fmtNextPayDate(fixed(25), SHORT)).toBe('Flexible');
  });
});

// ── pickNextUnpaid ────────────────────────────────────────────────────────────

describe('pickNextUnpaid', () => {
  it('returns null when everything is received', () =>
    expect(pickNextUnpaid([makeIncome({ received: true })], SEP)).toBeNull());

  it('returns null for an empty or missing list', () => {
    expect(pickNextUnpaid([], SEP)).toBeNull();
    expect(pickNextUnpaid(null, SEP)).toBeNull();
  });

  it('picks the soonest pay date', () => {
    const early = { ...fixed(5),  id: 'early' };
    const late  = { ...fixed(25), id: 'late'  };
    expect(pickNextUnpaid([late, early], SEP).id).toBe('early');
  });

  // THE sort bug: keyed on `pay_day`, which is null for last_working_day, so the
  // household's main salary sank below every ad-hoc source as if it had no schedule.
  it('ranks a last-working-day salary on its real date, ahead of a flexible source', () => {
    const salary = { ...lastWork(), id: 'salary' };            // 30 Oct (Fri)
    const adhoc  = { ...flexible(), id: 'adhoc'  };
    const picked = pickNextUnpaid([adhoc, salary], OCT);
    expect(picked.id).toBe('salary');
    expect(picked.payDate).toBe('2026-10-30');
    expect(picked.daysUntil).not.toBeNull();
  });

  it('sinks flexible sources to the bottom, never to the top', () => {
    const adhoc = { ...flexible(), id: 'adhoc' };
    const dated = { ...fixed(25),  id: 'dated' };
    expect(pickNextUnpaid([adhoc, dated], SEP).id).toBe('dated');
    expect(pickNextUnpaid([dated, adhoc], SEP).id).toBe('dated');
  });

  it('falls back to a flexible source when it is the only one left', () =>
    expect(pickNextUnpaid([{ ...flexible(), id: 'adhoc' }], SEP).id).toBe('adhoc'));

  it('skips received sources when ranking', () => {
    const receivedEarly = { ...fixed(5),  id: 'done', received: true };
    const pendingLate   = { ...fixed(25), id: 'todo' };
    expect(pickNextUnpaid([receivedEarly, pendingLate], SEP).id).toBe('todo');
  });
});

// ── getIncomeStatus ───────────────────────────────────────────────────────────

describe('getIncomeStatus', () => {
  it('returns received when received is true', () =>
    expect(getIncomeStatus(makeIncome({ received: true }), SEP, '2026-09-01')).toBe('received'));

  it('returns flexible when the source has no pay date', () =>
    expect(getIncomeStatus(flexible(), SEP, '2026-09-01')).toBe('flexible'));

  it('returns today on the pay day (previously unreachable)', () =>
    expect(getIncomeStatus(fixed(25), SEP, '2026-09-25')).toBe('today'));

  it('returns soon within three days', () => {
    expect(getIncomeStatus(fixed(25), SEP, '2026-09-22')).toBe('soon');
    expect(getIncomeStatus(fixed(25), SEP, '2026-09-24')).toBe('soon');
  });

  it('returns upcoming further out', () =>
    expect(getIncomeStatus(fixed(25), SEP, '2026-09-10')).toBe('upcoming'));

  it('returns upcoming once the date has passed unreceived (no Missed state)', () =>
    expect(getIncomeStatus(fixed(25), SEP, '2026-09-28')).toBe('upcoming'));

  // THE mislabelling bug: pay_day is null for this type, so the badge said "Flexible"
  // directly above a subtitle reading "Last working day".
  it('gives a last_working_day source a real status, not Flexible', () => {
    expect(getIncomeStatus(lastWork(), OCT, '2026-10-30')).toBe('today');
    expect(getIncomeStatus(lastWork(), OCT, '2026-10-28')).toBe('soon');
    expect(getIncomeStatus(lastWork(), OCT, '2026-10-05')).toBe('upcoming');
  });

  // The countdown ladder only means something in the period the user is living in.
  it('never says today/soon for a period that does not contain today', () => {
    expect(getIncomeStatus(fixed(25), OCT, '2026-09-05')).toBe('upcoming');   // future period
    expect(getIncomeStatus(fixed(25), SEP, '2026-10-05')).toBe('upcoming');   // past period
  });
});
