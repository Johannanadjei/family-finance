# REPLAY.md — Database rebuild / replay order

How to reconstruct the Money B.O.S Postgres schema on a fresh Supabase project
(the planned **eu-west-1** migration). Lists every `scripts/*.sql` file in
dependency order.

> Extracted/authored pre-migration, 2026-06-05. Companion to the source-of-truth
> work in commits `9a92591` (functions + triggers), `c926499` (RLS policies),
> and `c63f7b9` (`get_centre_guests`).

---

## ⚠️ Read this first — the scripts are NOT a complete from-zero build

The repo does **not** contain `CREATE TABLE` for the 8 core tables. They were
created by hand in the Supabase SQL Editor during early development and were
never committed. Only **3 of 11** tables have committed DDL:

| Table | DDL location |
|---|---|
| `centre_invites` | `members_rbac.sql` |
| `budget_cycles` | `migrate_cycles_schema.sql` |
| `subscriptions` | `migrate_19_subscriptions.sql` |

**Missing base DDL (8 tables):** `budget_centres`, `budget_centre_members`,
`users`, `user_preferences`, `budget_categories`, `income_sources`,
`transactions`, `guest_users`.

Everything in `scripts/` *assumes those 8 tables already exist* (they `ALTER`,
backfill, trigger, and gate them). Replaying the scripts onto an empty database
will fail at the first `ALTER TABLE`/policy that references a missing table.

### ✅ Recommended migration path

1. **`pg_dump --schema-only` from production** → load into the new project.
   This is the real migration vehicle: it brings the 8 base tables (and, in
   practice, all their current functions/triggers/policies too).
2. **`pg_dump --data-only`** (or Supabase's migration tooling) for the rows.
3. Use the files in this repo as **source-of-truth + verification** — the
   idempotent overlay (Phase 3 below) is safe to run *after* the dump to pin the
   canonical end-state and prove every object landed (each ends in a
   self-verifying `DO` block that RAISEs on any mismatch).

The phased order below is for the case where you **rebuild from scripts** (e.g.
no dump available, or you reconstruct the 8 base tables by hand first). It is the
historical build order, so it is provably correct — it is how production was
built — but it presumes Phase 0 is done.

---

## Phase 0 — Base schema (NOT in repo)

Create the 8 core tables listed above (via `pg_dump --schema-only`, or hand-
reconstructed). Every later phase depends on this. Without it, stop here.

---

## Phase 1 — Incremental schema & data migrations

Run in this order. Files are idempotent (`IF EXISTS` / `IF NOT EXISTS` guards)
unless flagged **one-shot** (a data backfill — harmless to re-run, but it only
does work once).

### 1a — Additive columns (independent, order-free among themselves)
1. `pin_setup.sql` — `users.pin_hash`
2. `archive_hub.sql` — `budget_centres.is_archived` + partial index
3. `migrate_transactions_from_spare.sql` — `transactions.from_spare`

### 1b — Roles & invites
4. `members_rbac.sql` — extends member-role CHECK, **creates `centre_invites`**,
   sets `budget_centres` RLS (owner/member read). *Must precede 5.*
5. `migrate_invite_expires_at.sql` — `centre_invites.expires_at NOT NULL` + backfill

### 1c — Income model (order matters)
6. `migrate_income_source_fk.sql` — durable FK income_tx → income_source
7. `migrate_income_month.sql` — month-scopes `income_sources`; depends on 6
   (resolves the `income_source_id`-NULL rows it leaves)

### 1d — Budget Cycles project (long internal chain — keep this order)
8. `migrate_cycles_schema.sql` — *Commit 1*: **creates `budget_cycles`** + its RLS
9. `migrate_cycles_fk_columns.sql` — *Commit 2a*: `cycle_id` FK columns + indexes
10. `migrate_cycles_backfill.sql` — *Commit 2b*: backfill `cycle_id` (**one-shot**, needs 9)
11. `migrate_cycles_rpc.sql` — *Commit 3*: `create_calendar_cycle` RPC
12. `migrate_cycle_id_trigger.sql` — *Commit 10*: `resolve_cycle_id` BEFORE INS/UPD trigger
13. `migrate_backfill_cycle_ids.sql` — *Commit 10*: fill remaining NULL `cycle_id` (**one-shot**)
14. `migrate_move_cycle_trigger.sql` — *Commit 12*: amends `resolve_cycle_id` (UPDATE branch)
15. `migrate_14b_anchor.sql` — *Commit 14b*: anchor types + `create_cycle_by_anchor`,
    `cycle_anchored_day`, **`cycle_majority_name`**
16. `migrate_14b_fix_dual_basis.sql` — *Commit 14b fix*: range bug
17. `migrate_14b_fix_naming.sql` — *Commit 14b fix*: name bug
18. `migrate_15_remove_anchor_columns.sql` — *Phase A*: **drops** the 14b anchor
    scaffolding **but KEEPS `cycle_majority_name`** (16 depends on it)
19. `migrate_16_create_budget_period.sql` — *Phase B*: `create_budget_period` RPC
20. `migrate_17_year_constraint.sql` — replaces `create_budget_period` (adds current-year rule)
21. `migrate_18_reset_budget_period.sql` — `reset_budget_period` RPC

> **Net-cancel note:** steps 15–18 add anchor machinery and then remove most of
> it. They are kept because that is the real history and because step 15 leaves
> `cycle_majority_name` behind, which `create_budget_period` (19–20) needs. If you
> are reconstructing the *end-state* and not the history, you may skip 15–17's
> anchor columns/functions **only if** you still create `cycle_majority_name` and
> the `no_overlapping_cycles` GiST constraint that 16's verify block asserts.
> When in doubt, run them all — they are idempotent.

### 1e — Subscriptions
22. `migrate_19_subscriptions.sql` — **creates `subscriptions`** + `subscriptions_select_own` RLS

### 1f — Data backfill (run after all schema is in place)
23. `backfill_user_names.sql` — fills NULL/empty `public.users.name` (**one-shot**)

---

## Phase 2 — Helper functions (must precede Phase 3)

The two RLS predicate helpers are referenced by the Phase 3 `rls_*.sql` files, so
they must exist first. (No `migrate_` file uses them — the cycle/period RPCs and
the `budget_cycles`/`budget_centres` policies inline their own `EXISTS` checks.)

24. `is_budget_centre_member.sql`
25. `is_budget_centre_owner.sql`

---

## Phase 3 — Source-of-truth overlay (idempotent, run LAST)

All idempotent (`CREATE OR REPLACE` / `DROP … IF EXISTS` + `CREATE`). Running them
last pins every function, trigger, and policy to its current production
definition, and each self-verifies. Order within the phase is free **except**
that the `rls_*.sql` files require Phase 2.

### 3a — Trigger functions + triggers
26. `handle_new_user.sql` — fn + `on_auth_user_created` trigger on `auth.users`
27. `handle_updated_at.sql` — fn + 7 `BEFORE UPDATE` triggers

### 3b — RPCs (client-callable)
28. `accept_invite.sql`
29. `authenticate_guest.sql`
30. `submit_guest_transaction.sql`
31. `get_centre_guests.sql`

### 3c — RLS policies for the 7 tables that had no committed policies
32. `rls_users.sql`
33. `rls_user_preferences.sql`
34. `rls_budget_centre_members.sql`
35. `rls_budget_categories.sql`
36. `rls_income_sources.sql`
37. `rls_transactions.sql`
38. `rls_guest_users.sql`

> RLS for the other 4 tables ships earlier: `budget_centres` + `centre_invites`
> in `members_rbac.sql` (step 4), `budget_cycles` in `migrate_cycles_schema.sql`
> (step 8), `subscriptions` in `migrate_19_subscriptions.sql` (step 22). Full RLS
> surface = those 10 policies + the 26 here = **36 policies across 11 tables**.

---

## Phase 4 — Verify

Every Phase 2/3 file ends in a `DO $$` block that RAISEs on mismatch, so a clean
run is its own proof. Spot-check totals:

```sql
-- Functions present (expect the 12 production RPCs/helpers + trigger fns)
SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' ORDER BY 1;

-- 36 policies across 11 tables
SELECT tablename, count(*) FROM pg_policies WHERE schemaname='public'
GROUP BY tablename ORDER BY tablename;

-- RLS enabled on every app table
SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity ORDER BY 1;
```

---

## File inventory by type (37 files)

- **Base-table DDL:** `members_rbac.sql` (centre_invites), `migrate_cycles_schema.sql`
  (budget_cycles), `migrate_19_subscriptions.sql` (subscriptions). *The other 8
  tables are not in the repo — see Phase 0.*
- **Schema ALTER / index:** `pin_setup`, `archive_hub`, `migrate_transactions_from_spare`,
  `migrate_invite_expires_at`, `migrate_income_source_fk`, `migrate_income_month`,
  `migrate_cycles_fk_columns`, plus the cycles chain.
- **One-shot data backfills:** `migrate_cycles_backfill`, `migrate_backfill_cycle_ids`,
  `backfill_user_names`.
- **Functions / RPCs:** `is_budget_centre_member`, `is_budget_centre_owner`,
  `handle_new_user`, `handle_updated_at`, `accept_invite`, `authenticate_guest`,
  `submit_guest_transaction`, `get_centre_guests`, plus cycle/period RPCs inside
  the `migrate_*` files (`create_calendar_cycle`, `create_budget_period`,
  `reset_budget_period`, `resolve_cycle_id`, `cycle_majority_name`; superseded:
  `create_cycle_by_anchor`, `cycle_anchored_day`).
- **RLS overlay:** the 7 `rls_*.sql` files.
