# REPLAY.md — Database rebuild / replay order

How to reconstruct the Money B.O.S Postgres schema on a fresh Supabase project
(the planned **eu-west-1** migration). Lists every `scripts/*.sql` file in
dependency order.

> Extracted/authored pre-migration, 2026-06-05. Companion to the source-of-truth
> work in commits `9a92591` (functions + triggers), `c926499` (RLS policies),
> `c63f7b9` (`get_centre_guests`), and `55a469f` (`schema_base.sql` — the 8 base tables).

---

## ⚠️ Read this first — two ways to rebuild

**All 11 tables now have committed DDL.** As of `55a469f`, the 8 core tables live
in `schema_base.sql` (extracted via `pg_dump --schema-only`); the other 3 ship in
their feature files:

| Table(s) | DDL location |
|---|---|
| `users`, `user_preferences`, `budget_centres`, `budget_centre_members`, `guest_users`, `budget_categories`, `income_sources`, `transactions` | `schema_base.sql` |
| `centre_invites` | `members_rbac.sql` |
| `budget_cycles` | `migrate_cycles_schema.sql` |
| `subscriptions` | `migrate_19_subscriptions.sql` |

`schema_base.sql` is the **end-state** structure (a `pg_dump` reflects the
fully-evolved schema), so it already contains every column the incremental
`migrate_*` files added (`cycle_id`, `is_archived`, `pin_hash`, `from_spare`,
`month`, `income_source_id`, …). That gives two coherent rebuild strategies:

### ✅ Strategy A — End-state rebuild (RECOMMENDED for a fresh project)

Skip the incremental schema churn; go straight to the current shape:

1. **Phase 0** — `schema_base.sql` (8 base tables, end-state).
2. **Phase 0b** — the 3 remaining tables + their cycle wiring:
   `migrate_cycles_schema.sql` (budget_cycles) → `migrate_cycles_fk_columns.sql`
   (the deferred `cycle_id` FKs + indexes) → `members_rbac.sql` (centre_invites +
   role CHECK + budget_centres RLS) → `migrate_invite_expires_at.sql` →
   `migrate_19_subscriptions.sql` (subscriptions).
3. **Phase 2** — helper functions, then **Phase 3** — the idempotent overlay
   (triggers, RPCs, `rls_*.sql`), then **Phase 4** — verify.

Under Strategy A the **Phase 1 list below is historical record** — the
schema-altering `migrate_*` files become no-ops against `schema_base.sql`'s
already-correct, empty tables (their `ADD COLUMN IF NOT EXISTS` and backfills do
nothing). You do not need to run them; they are kept for provenance and for
Strategy B. *(Alternatively, just `pg_dump`/restore the whole prod DB and use
this repo as the verification overlay — simplest of all.)*

### Strategy B — Full historical replay

Run `schema_base.sql` (Phase 0), then **every** `migrate_*` file in the Phase 1
order below, then Phases 2–4. Provably correct (it is how prod was built) but
does redundant add-then-drop work (see the 14b→15 net-cancel note). Use only if
you specifically want to reproduce the migration history.

> **Ordering invariant for both strategies:** `schema_base.sql` must run AFTER the
> Supabase-managed `auth` schema exists (`public.users` has an FK to
> `auth.users`) — always true on a fresh Supabase project.

---

## Phase 0 — Base schema

Run **`schema_base.sql`** — creates the 8 core tables (end-state), their PKs, 12
of 15 FKs, and 6 indexes; self-verifies. The 3 `cycle_id` FKs + 3 cycle indexes
are **deferred** to `migrate_cycles_fk_columns.sql` (they reference
`budget_cycles`). Then create the other 3 tables per **Strategy A, Phase 0b**
above (or proceed through Phase 1 under Strategy B).

---

## Phase 1 — Incremental schema & data migrations *(historical under Strategy A)*

The full historical build order. Under Strategy A these are a no-op against
`schema_base.sql` and may be skipped — kept here as the canonical record and for
Strategy B. Files are idempotent (`IF EXISTS` / `IF NOT EXISTS` guards) unless
flagged **one-shot** (a data backfill — harmless to re-run, but it only does work
once).

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

## File inventory by type (38 files)

- **Base-table DDL:** `schema_base.sql` (the 8 core tables), `members_rbac.sql`
  (centre_invites), `migrate_cycles_schema.sql` (budget_cycles),
  `migrate_19_subscriptions.sql` (subscriptions) — all 11 tables now in repo.
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
