/**
 * lib/logged-by-name-source.test.js
 *
 * Holds the SQL and the JS to the SAME source for transactions.logged_by_name.
 *
 * WHY THIS EXISTS: there are two doors onto that column and they disagreed.
 *   client — services/transactions.service.js
 *            tx.logged_by_name || user?.user_metadata?.full_name || ''
 *            i.e. auth.users.raw_user_meta_data ->> 'full_name'
 *   RPC    — mark_income_received (migrate_31, carried unchanged into migrate_32)
 *            SELECT COALESCE(NULLIF(name, ''), '') FROM users WHERE id = auth.uid()
 *            i.e. public.users.name
 *
 * Same person, same activity feed, two names — depending on whether the row came
 * from "log an expense" or "confirm a payday". migrate_34 points the RPC at the
 * metadata key the client uses, keeping public.users.name only as the fallback for
 * the case where the client would have written ''.
 *
 * HOW: reads the real migration and the real service off disk. Editing either
 * side's name source without the other fails here. Same technique, and the same
 * limits, as mark-income-received-week.test.js: it proves the two agree on the
 * FIELD, not that the RPC runs — that needs a live DB (see the migration's manual
 * verification block).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(resolve(__dirname, '../../scripts/migrate_34_mark_income_received_name.sql'), 'utf-8');
const svc = readFileSync(resolve(__dirname, '../services/transactions.service.js'), 'utf-8');

// The RPC's name resolution: everything between `INTO v_name` and the statement end.
const nameSelect = () => {
  const m = sql.match(/SELECT COALESCE\([\s\S]*?INTO\s+v_name[\s\S]*?;/);
  return m ? m[0] : '';
};

describe('logged_by_name — one source, two doors', () => {
  it('the client writes it from user_metadata.full_name', () => {
    expect(svc).toMatch(/logged_by_name:\s*tx\.logged_by_name\s*\|\|\s*user\?\.user_metadata\?\.full_name/);
  });

  it('the RPC reads the same field — auth.users.raw_user_meta_data.full_name', () => {
    const sel = nameSelect();
    expect(sel).toBeTruthy();
    expect(sel).toMatch(/raw_user_meta_data\s*->>\s*'full_name'/);
    expect(sel).toMatch(/FROM\s+auth\.users/);
  });

  it('the metadata key comes FIRST, ahead of the public.users.name fallback', () => {
    const sel = nameSelect();
    const meta = sel.indexOf('raw_user_meta_data');
    const fallback = sel.indexOf('pu.name');
    expect(meta).toBeGreaterThan(-1);
    expect(fallback).toBeGreaterThan(meta);   // fallback, not primary
  });

  it('both sides end at empty string, never null', () => {
    expect(svc).toMatch(/user\?\.user_metadata\?\.full_name\s*\|\|\s*''/);
    expect(nameSelect()).toMatch(/''\s*\n?\s*\)/);
  });

  it('the migration keeps its own regression guard on the installed function', () => {
    // If someone re-applies migrate_31/32 over this, the DO block must catch it.
    expect(sql).toMatch(/prosrc[\s\S]*raw_user_meta_data/);
  });
});
