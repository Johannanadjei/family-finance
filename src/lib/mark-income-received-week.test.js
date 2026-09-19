/**
 * lib/mark-income-received-week.test.js
 *
 * Holds the SQL week rule in mark_income_received against the JS getWeekForDate.
 *
 * WHY THIS EXISTS: migrate_31 moved the income-transaction INSERT from the client
 * (which called getWeekForDate) into an RPC, and `week` — text NOT NULL, no default
 * — was not carried across. Every INSERT-path call failed in production with a
 * 23502. migrate_32 added the column; this test is what stops the SQL banding
 * drifting away from the JS one afterwards.
 *
 * HOW: the CASE expression is parsed out of the migration file between its
 * WEEK_RULE_BEGIN / WEEK_RULE_END markers, turned into a JS predicate, and compared
 * to getWeekForDate for every day 1-31. It reads the real .sql on disk, so editing
 * a threshold in either language without the other fails here.
 *
 * WHAT IT CANNOT DO: it does not execute Postgres. It proves the two rules agree,
 * not that the RPC runs — that needs a live DB (see the migration's manual
 * verification block, and the staging-project gap recorded in engineering-decisions).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync }         from 'node:fs';
import { resolve }              from 'node:path';
import { getWeekForDate }       from './finance';

const SQL_PATH = resolve(__dirname, '../../scripts/migrate_32_mark_income_received_week.sql');
const sql = readFileSync(SQL_PATH, 'utf-8');

/** Pull the CASE body out of the migration between its stable markers. */
function extractWeekRule() {
  const begin = sql.indexOf('-- WEEK_RULE_BEGIN');
  const end   = sql.indexOf('-- WEEK_RULE_END');
  if (begin === -1 || end === -1) throw new Error('WEEK_RULE markers missing from migrate_32');
  return sql.slice(begin, end);
}

/**
 * Turn the SQL CASE into a JS function of day-of-month.
 * Parses `WHEN EXTRACT(DAY FROM …) <= N THEN 'Week M'` pairs plus the ELSE.
 */
function sqlWeekRuleToFn() {
  const body = extractWeekRule();
  const branches = [...body.matchAll(/WHEN\s+EXTRACT\(DAY FROM [^)]+\)\s*<=\s*(\d+)\s*THEN\s*'([^']+)'/g)]
    .map(m => ({ upTo: Number(m[1]), label: m[2] }));
  const elseMatch = body.match(/ELSE\s*'([^']+)'/);
  if (!branches.length) throw new Error('No WHEN branches parsed from the SQL week rule');
  if (!elseMatch)       throw new Error('No ELSE branch parsed from the SQL week rule');
  const fallback = elseMatch[1];
  return (day) => (branches.find(b => day <= b.upTo)?.label ?? fallback);
}

describe('mark_income_received — SQL week rule', () => {
  it('parses a complete CASE out of the migration file', () => {
    const body = extractWeekRule();
    expect(body).toContain('EXTRACT(DAY FROM p_date)');
    expect([...body.matchAll(/WHEN/g)]).toHaveLength(4);
    expect(body).toMatch(/ELSE\s*'Week 5'/);
  });

  // THE assertion this file exists for.
  it('agrees with getWeekForDate for every day of the month, 1-31', () => {
    const sqlWeek = sqlWeekRuleToFn();
    for (let day = 1; day <= 31; day++) {
      // A 31-day month so every day is a real date; the rule is day-of-month only.
      const dateStr = `2026-01-${String(day).padStart(2, '0')}`;
      expect(sqlWeek(day), `day ${day}`).toBe(getWeekForDate(dateStr));
    }
  });

  // Boundaries are where an off-by-one would hide; called out explicitly so a
  // failure names the edge rather than just "day 8".
  it.each([
    [7,  'Week 1'], [8,  'Week 2'],
    [14, 'Week 2'], [15, 'Week 3'],
    [21, 'Week 3'], [22, 'Week 4'],
    [28, 'Week 4'], [29, 'Week 5'],
    [31, 'Week 5'],
  ])('day %i bands to %s in both languages', (day, expected) => {
    const sqlWeek = sqlWeekRuleToFn();
    const dateStr = `2026-01-${String(day).padStart(2, '0')}`;
    expect(sqlWeek(day)).toBe(expected);
    expect(getWeekForDate(dateStr)).toBe(expected);
  });

  it('only ever yields values the transactions_week_check CHECK allows', () => {
    const sqlWeek = sqlWeekRuleToFn();
    const allowed = new Set(['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5']);
    for (let day = 1; day <= 31; day++) expect(allowed.has(sqlWeek(day))).toBe(true);
  });
});

describe('mark_income_received — NOT NULL coverage', () => {
  // schema_base.sql: these are NOT NULL with no default, so the INSERT must name
  // every one. `week` is the one migrate_31 missed.
  it.each(['budget_centre_id', 'date', 'week', 'type', 'category_name', 'amount'])(
    'the INSERT column list names %s', (col) => {
      const insert = sql.slice(sql.indexOf('INSERT INTO transactions'), sql.indexOf('RETURNING * INTO v_tx;\n    v_created'));
      expect(insert).toContain(col);
    }
  );

  it('sets week on the UPDATE path too, so a moved date re-bands', () => {
    const update = sql.slice(sql.indexOf('UPDATE transactions'), sql.indexOf('RETURNING * INTO v_tx;'));
    expect(update).toMatch(/week\s*=\s*v_week/);
  });
});
