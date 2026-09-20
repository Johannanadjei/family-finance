import { describe, it, expect } from 'vitest';
import { sortTxsByDate } from './activity';

// Recent Activity read `txs` in load order, and the optimistic-update contract
// prepends newly-added rows — so a back-dated receipt confirmed today sat above
// transactions that actually happened later.
describe('sortTxsByDate', () => {
  const tx = (id, date, created_at) => ({ id, date, created_at });

  it('orders by transaction date, newest first', () => {
    const out = sortTxsByDate([tx('a', '2026-09-12'), tx('b', '2026-09-19'), tx('c', '2026-09-05')]);
    expect(out.map(t => t.id)).toEqual(['b', 'a', 'c']);
  });

  it('puts a freshly-prepended back-dated row back where its date belongs', () => {
    // The shape the bug produced: a 12 Sep receipt prepended on the 19th.
    const loadOrder = [tx('receipt', '2026-09-12', null), tx('later', '2026-09-19', '2026-09-19T08:00:00Z')];
    expect(sortTxsByDate(loadOrder).map(t => t.id)).toEqual(['later', 'receipt']);
  });

  it('breaks a same-day tie on created_at, newest first', () => {
    const out = sortTxsByDate([
      tx('morning', '2026-09-12', '2026-09-12T08:00:00Z'),
      tx('evening', '2026-09-12', '2026-09-12T20:00:00Z'),
    ]);
    expect(out.map(t => t.id)).toEqual(['evening', 'morning']);
  });

  it('sorts a row with no created_at after its same-day siblings', () => {
    const out = sortTxsByDate([
      tx('optimistic', '2026-09-12', undefined),
      tx('settled',    '2026-09-12', '2026-09-12T08:00:00Z'),
    ]);
    expect(out.map(t => t.id)).toEqual(['settled', 'optimistic']);
  });

  it('does not mutate its input', () => {
    const input = [tx('a', '2026-09-05'), tx('b', '2026-09-19')];
    sortTxsByDate(input);
    expect(input.map(t => t.id)).toEqual(['a', 'b']);
  });

  it('handles an empty or missing list', () => {
    expect(sortTxsByDate([])).toEqual([]);
    expect(sortTxsByDate(undefined)).toEqual([]);
  });
});
