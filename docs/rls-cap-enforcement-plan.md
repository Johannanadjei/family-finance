# RLS cap-enforcement sweep — DESIGN ONLY

Design pass for the backlog entry *"Plan caps are not enforced at the RLS layer — direct-write
bypass + history REST leak"* (`docs/backlog.md`, OPEN / P1).

**Status: Step 0 preflight RAN 2026-08-22 (read-only) and came back GREEN. No policy or
function has been changed.** Everything from Step 1 onward is still unwritten and unrun.
Every "before" state below was originally read from the in-repo policy files rather than from
`pg_policies`; the preflight has now confirmed those files against production — see
[Step 0 results](#step-0-results). Two scope changes since the first draft: **Leak 2 is a
deliberate won't-fix** (D2 answered — see the backlog entry), which retires preflight P3 and
P5, and the run-list therefore ends at Step 4.

**Framing (inherited from the backlog entry, unchanged).** These are **revenue-integrity**
leaks, not data-isolation leaks. Membership scoping holds everywhere: no household can reach
another household's rows, before or after this sweep. What leaks is **paid capability**. That
framing sets the risk asymmetry for the whole plan:

> A missed leak costs some Pro revenue from someone willing to drive PostgREST by hand.
> An over-tight predicate locks a real member out of their own hub, instantly, on shared prod.
> **The second is the worse failure.** Every design choice below is biased accordingly.

**The invariant that bounds the lockout risk:** *no step in this sweep edits a membership or
role predicate.* `is_budget_centre_member`, `is_budget_centre_owner`, `can_view_income` and the
existing permissive policies that use them are **not touched by any step**. New capability
rules are added either as (a) a narrowed INSERT on a path no client code uses, or (b) a
separate `AS RESTRICTIVE` policy that ANDs a tier clause on top of the untouched membership
rules. That means a botched step can hide rows, but can never widen access, and can never
change *who* is a member of *what*.

---

## Table of contents

- [Step 0 — Preflight (read-only, run before anything is finalised)](#step-0--preflight)
- [Leak 1 — Category cap: direct-write bypass](#leak-1--category-cap-direct-write-bypass)
- [Leak 2 — History: no server enforcement (the hard one)](#leak-2--history-no-server-enforcement)
- [Leak 3 — Member cap: owner-only bypass](#leak-3--member-cap-owner-only-bypass)
- [Helper inventory — is `hub_tier()` reusable?](#helper-inventory)
- [Client changes that must ship with the SQL](#client-changes-that-must-ship-with-the-sql)
- [Ordered run-list](#ordered-run-list)
- [Rollback](#rollback)
- [Verification matrix (test accounts)](#verification-matrix)
- [Open decisions — need your call before any SQL is written](#open-decisions)

---

## Step 0 — Preflight

Read-only. Five things the design depends on that cannot be verified from the repo. If any
comes back unexpected, the affected step gets redesigned before it is written.

| # | What | Why it matters |
|---|---|---|
| P1 | `SELECT * FROM pg_policies WHERE tablename IN ('budget_categories','budget_centre_members','budget_cycles','transactions','income_sources')` | The repo's `rls_*.sql` files are marked *"extracted verbatim from production 2026-06-05"*. Nine months of hand-edits may have drifted. Every "before" in this doc is from the files; this is the check that they are still true. |
| P2 | `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN (…)` | If `relforcerowsecurity` is **true** anywhere, RLS applies to the table owner too — which would mean the `SECURITY DEFINER` RPCs (`create_category`, `accept_invite`, `create_hub`) are *also* subject to the new policies. Every "the RPCs are unaffected" claim in this doc assumes `FORCE` is off. This is the single most important preflight row. |
| P3 | `SELECT defaclrole::regrole, defaclacl FROM pg_default_acl WHERE defaclnamespace='public'::regnamespace` | Per CLAUDE.md §9.6 — confirms new helper functions will be auto-granted to `anon`/`authenticated`, so the new helpers' GRANT/REVOKE lines are written knowingly. |
| P4 | `SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name='budget_categories'` (and `budget_centre_members`) | Leak 1 and Leak 3 both close a door at the *policy* layer. Knowing whether `authenticated` also holds a table-level `INSERT` grant tells us whether a `REVOKE` is the better instrument than a `WITH CHECK (false)`. |
| P5 | Does any **anon / guest** path read `transactions` or `budget_categories`? (`rls_guest_users.sql`, `migrate_27_guest_sessions.sql`, `submit_guest_transaction`) | A `RESTRICTIVE` policy applies to **every** role, including the guest paths. `submit_guest_transaction` is `SECURITY DEFINER` so its *write* is fine, but if a guest session *reads* rows through PostgREST, Step 6 would gate those reads too. Needs a confirmed answer before Step 6. |

<a id="step-0-results"></a>
### Step 0 results — ran 2026-08-22, read-only, GREEN

Query: `scripts/rls_sweep_preflight.sql`. P3 and P5 not run (retired with Leak 2).

| # | Result | Verdict |
|---|---|---|
| **P1** | All 8 live policies match the repo files **exactly** — same commands, all `PERMISSIVE`, all `TO public`, same predicates. Critically, **both UPDATE policies have no new-row clause**, confirming the blind-write fallback this sweep closes. | ✅ No drift. Every "Before" table below is accurate. |
| **P1b** | 4 policies on `budget_categories`, 4 on `budget_centre_members`. | ✅ As the plan assumes |
| **P2** | `FORCE = false` and `rowsecurity = true` on all 8 relations; owner `postgres` throughout. | ✅ **The blocker cleared.** The `SECURITY DEFINER` RPCs are exempt from the new policies, so `WITH CHECK (false)` cannot break the category RPC or new-user signup. |
| **P2b** | **19** `SECURITY DEFINER` functions in `public`, every one owned by `postgres`, which holds **`rolbypassrls = true`** (`rolsuper = false` — the managed-Supabase shape). | ✅ Stronger than the plan assumed: the RPCs bypass RLS by role attribute, not merely by owning the relation. `BYPASSRLS` outranks `FORCE`, so this would hold even if P2 ever flipped. |
| **P2c** | Single owning role (`postgres`) across all 8. | ✅ P2b reads as one fact |
| **P4** | `authenticated` **and** `anon` each hold `arwdDxtm` — the full letter set, including row-add — on both target relations. | ⚠️ Not a blocker; it makes the instrument a real choice. See below. |
| **P6** | `budget_categories` 0/761 · `transactions` 0/414 · `income_sources` **1**/95 rows with NULL `cycle_id`. | ℹ️ Informational (Leak 2 skipped). The single orphan income source is unrelated to this sweep but is invisible to every cycle-keyed view — worth chasing separately. |

**P4 does not change the recommendation, and the reason is worth recording.** Both roles holding
the row-add letter means `REVOKE` is now genuinely available as an instrument, but the policy
remains the better primary:

- **Rollback symmetry.** A policy change is undone by pasting policy SQL from
  `scripts/rls_budget_categories.sql` — which is how every other rule on these relations is
  expressed and restored. (Once that file is v2 the inverse is the ROLLBACK block in its header,
  not the file body; see [Leak 1 — Destructive vs reversible](#leak-1-rollback). The
  symmetry argument is unaffected — the undo still lives in the same file, same layer.) A grant
  change lives in a different layer, is invisible in `pg_policies`, and would silently contradict
  the repo file a future reader consults.
- **Uniformity of shape.** Every access rule on every relation in this schema is a policy. A
  relation-level privilege carve-out on two tables and only those two is a shape nothing else in
  the codebase has, and it is invisible both in `pg_policies` and in the `rls_*.sql` file a future
  reader consults for that table's rules.

  *(Correction: an earlier draft of this section argued that Supabase's `pg_default_acl` would
  silently restore a withdrawn privilege. That is wrong — default ACLs apply at object **creation**,
  so a withdrawal on an existing relation is stable. The case against the REVOKE is legibility,
  not durability.)*

**The regression risk that would otherwise justify a second lock is answered in-layer.** The
scenario worth guarding is someone re-running v1 of the policy file — the repo's whole idiom is
"re-run this idempotent file to restore" — which would silently reopen the door. The v2 verify
block asserting the new-row clause is literally `false` catches that in the same layer, and in
the same file, as the rule itself.

**One vector the policy closes that is worth naming**, because it is the one place a `REVOKE`
would plausibly have been the stronger tool: PostgREST supports upsert
(`Prefer: resolution=merge-duplicates`). On `budget_centre_members` that means an owner could
`POST` a row that conflicts with the `(budget_centre_id, user_id)` unique and carries
`deleted_at = null`, turning an add into a resurrection without ever issuing a `PATCH`. The
conflict path is governed by the UPDATE policy, whose new `USING` requires `deleted_at IS NULL`
on the **old** row — which a soft-deleted member fails. Covered, but only because the
resurrection guard is on `USING` rather than `WITH CHECK`. Worth an explicit MUST-FAIL row.

A `REVOKE` remains available as a **second, independent lock** if the policy alone ever proves
insufficient. If it is ever added, it belongs in the same file with its own assertion in the
verify block, so it is not invisible. It is deliberately not taken in this sweep.

**Two things the wider P2b inventory surfaced** (it listed every definer function rather than a
hand-picked set, which is why they appeared at all):

- **`update_centre_currency` does not exist** — not in `pg_proc`, not in `scripts/`. CLAUDE.md
  §9.6 (line 480) names it as an established gate RPC alongside `create_hub` / `create_invite` /
  `accept_invite` / `create_category` / `update_centre_skin`. Currency is in fact changed by
  `updateCentre`'s direct `.update()` on `budget_centres`
  (`src/services/centres.service.js:129-136`). A stale reference in the rule this sweep leans on;
  CLAUDE.md should drop the name.
- **Four definer functions the plan never listed** — `create_budget_period`,
  `reset_budget_period`, `resolve_cycle_id` (the cycle-keying trigger), and `get_invite_by_token`.
  All owned by `postgres`, so all exempt; none changes the design. Noted because
  `create_budget_period` is a second RPC-side writer to `budget_categories` beyond the two the
  plan's "what actually writes to this table" table names.

**Conclusion: nothing blocks Steps 3 and 4.** Both may be written as designed.

---

## Leak 1 — Category cap: direct-write bypass

### Before

`scripts/rls_budget_categories.sql` — 4 policies, all `PERMISSIVE`, `TO public`:

| Policy | Cmd | Predicate |
|---|---|---|
| `budget_categories_insert` | INSERT | `WITH CHECK (is_budget_centre_member(budget_centre_id))` |
| `budget_categories_select_member` | SELECT | `USING (is_budget_centre_member(budget_centre_id))` |
| `budget_categories_select_owner` | SELECT | `USING (is_budget_centre_owner(budget_centre_id))` |
| `budget_categories_update` | UPDATE | `USING (is_budget_centre_member(budget_centre_id))` — **no `WITH CHECK`** |

### The finding is wider than the backlog entry states

The entry names the INSERT bypass. Reading the four policies together, the cap is bypassable
**three** ways, and closing only the first leaves the cap decorative:

1. **Direct INSERT** (the known one) — `POST /rest/v1/budget_categories` with a member token.
   No count, no tier.
2. **Resurrection** — `budget_categories_update` has no `WITH CHECK` and its `USING` does not
   exclude soft-deleted rows. A member can `PATCH` `deleted_at → null` on 40 previously
   deleted categories. Net effect identical to 40 inserts, and it never touches the INSERT
   path this sweep is closing.
3. **Relocation** — the cap is *per cycle* (create_category Decision D1). A member can `PATCH`
   `cycle_id` on categories from three past periods into the current one. Ten in period A plus
   ten in period B become twenty in period C. Again, no INSERT involved.

Any design that only hardens INSERT closes one of three doors.

### What actually writes to this table

Grepped `src/` for `from('budget_categories')` and `rpc('create_categor`:

| Path | Mechanism |
|---|---|
| Create one (`AddCategorySheet` → `categories.service.js:109`) | `rpc('create_category')` — SECURITY DEFINER |
| Create many / rollforward (`categories.service.js:165`) | `rpc('create_categories_bulk')` — SECURITY DEFINER |
| Read (`getCategories`, `getAllCategories`, `getCategoryById`) | direct `.select()` |
| Update / soft-delete (`updateCategory`, `deleteCategory`) | direct `.update()` |

**No client code inserts into `budget_categories` directly.** Onboarding goes through
`create_categories_bulk`; rollforward goes through the same RPC. That single fact is what makes
the recommended fix safe.

### After — recommended

**(a) Close the INSERT door entirely rather than making it tier-aware.**

```
budget_categories_insert   INSERT   WITH CHECK (false)
```

Rationale for departing from the brief (which proposed a tier-aware INSERT predicate):

- A tier-aware `WITH CHECK` would have to re-derive the per-cycle count inside a policy — a
  correlated subquery on `budget_categories` **inside a policy on `budget_categories`**, which
  Postgres rejects as infinite policy recursion. It would need a `SECURITY DEFINER` helper to
  escape, so it is not actually cheaper than the alternatives.
- Even if written, it cannot hold the advisory lock `create_category` uses, so it is not
  race-proof: two concurrent direct inserts at limit−1 both pass and land at limit+1.
- It would still skip the RPC's name/amount validation and icon defaulting, so a direct insert
  remains a way to write rows the app can't produce.
- The RPC is unaffected by the policy (SECURITY DEFINER runs as the table owner; policies don't
  apply to the owner unless `FORCE ROW LEVEL SECURITY` — **preflight P2**).

`WITH CHECK (false)` states the real rule — *"this table has exactly one write door, and it is
`create_category`"* — instead of maintaining a second, weaker copy of the cap.

**(b) Close resurrection, in the same step:**

```
budget_categories_update   UPDATE   USING      (is_budget_centre_member(budget_centre_id) AND deleted_at IS NULL)
                                    WITH CHECK (is_budget_centre_member(budget_centre_id))
```

`USING` picks the **old** row, so adding `deleted_at IS NULL` makes a soft-deleted row
untouchable — un-deletion becomes impossible without comparing old to new (which RLS can't do).
The explicit `WITH CHECK` also removes the current blind-write fallback, matching the shape
`rls_transactions.sql` and `rls_income_sources.sql` already assert on.

**(c) Relocation** — RLS cannot express "this UPDATE must not push the destination cycle over
its cap" (a `WITH CHECK` sees only the new row, and a same-table count subquery recurses). The
only complete answer is a `BEFORE INSERT OR UPDATE ... FOR EACH ROW` trigger enforcing CAT01 at
the storage layer, which would subsume (a), (b) and (c) at once. **See [Open decisions](#open-decisions) — this is D3 and I am not recommending it in the first pass.** It is the one
piece of this sweep with a real path to breaking a legitimate write (a Pro→Free downgraded hub
with 40 live categories would fail its next rollforward), and relocation is the lowest-value
bypass of the three: it can't create net-new categories, only concentrate existing ones.

### MUST-PASS — legitimate access that must still work

| # | Actor | Action | Expected |
|---|---|---|---|
| 1.1 | **standard** member, **Pro** hub | Add a category via the app (11th, 12th…) | ✅ Succeeds. Owner-tier resolution in `create_category` is unchanged; the RPC bypasses RLS. **This is the headline over-tightening risk for Leak 1.** |
| 1.2 | **standard** member, **Free** hub | Add categories 1–10 via the app | ✅ Succeeds |
| 1.3 | any member | Onboarding starter categories (`create_categories_bulk`) | ✅ Succeeds — RPC path, RLS not applied |
| 1.4 | owner / full_access | Create a new budget period → rollforward copies categories | ✅ Succeeds — same RPC |
| 1.5 | any member | Edit a live category's name / amount / icon / sort order | ✅ Succeeds — `deleted_at IS NULL` holds for live rows |
| 1.6 | any member | Soft-delete a category | ✅ Succeeds — the row is live at the moment of the UPDATE; `USING` is evaluated on the **old** row |
| 1.7 | any member | Read categories, incl. previously deleted ones (none are read) | ✅ Unchanged — SELECT policies untouched |

1.6 is the subtle one and the reason `USING` (old row) is the right place for the guard: soft-delete
is an UPDATE from live → deleted, so the old row passes. Only a *second* update to an
already-deleted row is blocked, which is exactly the resurrection case. Worth an explicit test
rather than reasoning about it in the review.

### MUST-FAIL — the bypass, now blocked

| # | Actor | Action | Expected |
|---|---|---|---|
| 1.8 | member of a **Free** hub at 10/10, own token, curl | `POST /rest/v1/budget_categories` | ❌ RLS violation (42501) |
| 1.9 | member of a **Pro** hub, own token, curl | `POST /rest/v1/budget_categories` | ❌ Also blocked. Intentional: the rule is "one write door", not "one write door for Free hubs". No legitimate client path is affected. |
| 1.10 | member, curl | `PATCH /rest/v1/budget_categories?id=eq.<deleted>` setting `deleted_at=null` | ❌ Blocked (no row matches `USING`) |
| 1.11 | member, curl | `PATCH` `budget_centre_id` to another hub they belong to | ❌ Blocked by the new explicit `WITH CHECK`, which no longer silently falls back |
| 1.12 | member, curl | `PATCH` `cycle_id` to concentrate categories | ⚠️ **Still possible** — deferred, see D3 |

<a id="leak-1-rollback"></a>
### Destructive vs reversible

**Fully reversible, non-destructive.** Policy definitions only; no row is read, written or
deleted. Blast radius if wrong: category writes fail loudly with a 42501 the user sees as an
error toast — noisy, not silent, and reverted in one paste.

**The inverse is NOT "re-run the file".** `scripts/rls_budget_categories.sql` is now **v2** — it
*is* this change, so re-running it reapplies the fix rather than undoing it. To restore v1, paste
the **ROLLBACK block embedded in that file's header**, which carries v1's two changed policies
verbatim; `git show c926499:scripts/rls_budget_categories.sql` is the same thing from history.
Still one paste, still idempotent (`DROP POLICY IF EXISTS` + `CREATE`) — just not *that* paste.
The two SELECT policies are byte-identical across v1 and v2 and need no rollback at all.

---

## Leak 2 — History: no server enforcement

The one to design most carefully, per the brief. Three sub-questions: **RLS or RPC**, **what
the predicate is**, and **how the client still windows without the server over-returning**.

### Before

`scripts/migrate_cycles_schema.sql:73-108` — 2 policies on `budget_cycles`, both PERMISSIVE:

| Policy | Cmd | Predicate |
|---|---|---|
| `Members can view cycles in their hubs` | SELECT | active member of the hub |
| `Owners and full_access can manage cycles` | **ALL** | role ∈ (owner, full_access) |

Client-side window: `useFinance.js:174-177` → `visibleCycleWindow(cycles, historyMonthsVisible)`
→ newest **3** by `start_date desc` for Free, `Infinity` for Pro, keyed on `hubPlan` (the
owner's tier — already correct).

**First structural point.** The second policy is `FOR ALL`, which includes SELECT. Two
permissive policies OR together, so narrowing only *"Members can view…"* would leave every
owner and full_access member reading all history through the other one — and the owner of a
Free hub is exactly who the cap constrains (same shape as Leak 3). **Any narrowing here must be
a `RESTRICTIVE` policy**, which ANDs across the permissive union, rather than an edit to
either existing policy. That also means both existing policies stay byte-identical — the
membership invariant this whole plan rests on.

### Scope: cycles alone is not enough

The `budget_cycles` rows are the *navigation index*. The money is in the child tables, and all
three are membership-gated with no date or cycle condition:

| Table | SELECT gate | Reachable how |
|---|---|---|
| `transactions` | `is_budget_centre_member` (+ income-row role branch, `migrate_23`) | `GET /transactions?budget_centre_id=eq.X` — **no date filter needed**; returns every period ever |
| `budget_categories` | `is_budget_centre_member` | `getAllCategories` already fetches all months with no filter |
| `income_sources` | `can_view_income` | same shape |

Hiding cycle rows while leaving these open means a Free-hub member loses the *period picker*
but keeps every transaction. That is not enforcement — it is the client-side window
re-implemented one layer down. **Recommendation: Leak 2 is a four-table job or it is not worth
doing.** (This is [D1](#open-decisions) — the biggest scoping call in the sweep, and the one
that most changes the size of the work.)

### RLS or RPC — recommendation: **RLS (restrictive), plus one small scalar RPC for metadata**

| | RLS restrictive policies | RPC-only reads |
|---|---|---|
| Covers raw PostgREST | ✅ inherently | ❌ only if table SELECT is revoked |
| Covers the child tables | ✅ same pattern, 3 more policies | ❌ needs `get_transactions_by_cycle`, `get_categories`, `get_income_sources` RPCs — a rewrite of the read layer |
| Fits the codebase grain | ✅ CLAUDE.md §9.6 scopes RPC to cross-user **writes**; reads are direct PostgREST throughout | ❌ inverts the established pattern |
| Serves the UI's "N periods hidden" nudge | ❌ needs a companion scalar | ✅ returns it in the same call |
| Cost | per-row helper call (bounded — see below) | one call |
| Blast radius if wrong | rows vanish; policies drop in one statement | `REVOKE SELECT` breaks `getCycleById`, `getCycleForDate`, and any embed — a much bigger surface |

**Verdict: restrictive RLS for the boundary, one `SECURITY DEFINER` scalar RPC for the metadata
the nudge needs.** RPC-only fails on the decisive point: the leak is not the cycles index, it is
the child rows, and RPC-ifying those means rewriting `transactions.service` /
`categories.service` / `income.service` reads — a far larger change with a far worse failure
mode than four policies.

### The predicate — `visible_cycle_ids(centre) → uuid[]`

New helper, **required** (`hub_tier()` cannot be used here — see [Helper inventory](#helper-inventory)):

```
public.visible_cycle_ids(p_centre_id uuid) RETURNS uuid[]
  LANGUAGE plpgsql  STABLE  SECURITY DEFINER  SET search_path = public
```

Semantics:

1. Resolve the **owner's** tier by inlining the same active/non-expired/non-deleted
   `subscriptions` lookup used by `hub_tier`, `create_category`, `create_invite`,
   `update_centre_skin` and `resolveSubscription` (a sixth copy — see [D4](#open-decisions)).
2. `pro` → return **every** non-deleted cycle id for the hub. `free` → the newest
   `FREE_LIMITS.historyMonthsVisible` (= 3) by `start_date DESC`.
3. **Always union the cycle containing `current_date`**, regardless of tier or rank.
4. Never `RAISE`. Never return `NULL` — an empty array for a hub with no cycles.

Four deliberate choices, each guarding a specific failure:

- **`SECURITY DEFINER` is mandatory, not stylistic.** The helper reads `budget_cycles`. Called
  from a policy *on* `budget_cycles`, a non-definer read re-enters RLS → `infinite recursion
  detected in policy for relation "budget_cycles"`. Running as owner is what breaks the cycle.
- **ids, not a date floor.** A date floor (`start_date >= floor`) reads cheaper but misdescribes
  the child tables: `moveTransaction` (`transactions.service.js:207`) writes `cycle_id`
  **while preserving the transaction's date**, so a transaction can legitimately sit in a
  visible cycle with a date outside it. A date predicate would hide rows the app just moved.
  Matching on `cycle_id` is exactly what the client already does (`sliceByCycle`), so server and
  client agree by construction.
- **Never returns `NULL`.** `cycle_id = ANY(NULL)` evaluates to `NULL`, which fails a restrictive
  policy — so a "NULL means unrestricted" convention would blank out **every Pro hub**. Returning
  the full id list for Pro costs a few dozen uuids and removes the footgun entirely. The
  verification `DO` block should assert `array_length(visible_cycle_ids(<pro hub>),1)` equals the
  hub's live cycle count.
- **Never raises.** Inside a policy, a `RAISE` aborts the whole query instead of filtering a row.
  A helper that raises for non-members turns "you see fewer rows" into "the dashboard 500s".

**Point 3 — the union with the current cycle — is the single most important line in this
document.** Without it: a Free hub whose owner has created three future periods pushes the
*current* period to 4th-newest by `start_date`. The server stops returning it → `activeCycle`
resolves `null` → `useFinance.load()` hits its `if (!cycleId) { setLoading(false); return; }`
hold → the user sees the no-current-period prompt over their own live budget, permanently, with
no client-side recovery. The client survives this today only because `activeCycle` is resolved
from the **full** `cycles` list while only navigation uses `visibleCycles` — a distinction that
stops protecting anything the moment the server does the filtering. The client's
`visibleCycleWindow` must be given the same union so the two never disagree (see
[client changes](#client-changes-that-must-ship-with-the-sql)).

### After — the policies (existing ones untouched in all four cases)

```
-- budget_cycles: index
CREATE POLICY budget_cycles_history_window ON budget_cycles
  AS RESTRICTIVE FOR SELECT TO public
  USING ( id = ANY (public.visible_cycle_ids(budget_centre_id)) );

-- transactions / budget_categories / income_sources: the actual history
CREATE POLICY <table>_history_window ON <table>
  AS RESTRICTIVE FOR SELECT TO public
  USING ( cycle_id IS NULL
          OR cycle_id = ANY (public.visible_cycle_ids(budget_centre_id)) );
```

`cycle_id IS NULL` **fails open on purpose.** `cycle_id` is nullable on all three child tables
(`migrate_cycles_fk_columns.sql`) with `ON DELETE SET NULL`, and pre-Commit-10 legacy rows may
still exist. Hiding them would be a silent data-disappearance for a revenue rule — the wrong
trade under this plan's risk asymmetry.

`FOR SELECT` only. Writes stay governed by the existing policies; a Free hub can still *write*
to whatever its client can address. Gating writes by period age is cap creep and adds lockout
surface for no revenue gain.

**Known interaction to test, not to reason about:** `INSERT … RETURNING` (every
`.insert().select().single()` in the services) applies SELECT policies to the returned row. New
rows always land in the current cycle, which the union in point 3 guarantees is visible — so
this is safe *because of* that union. It is MUST-PASS 2.4 below rather than a footnote.

**Cost.** The helper is `STABLE` but takes a column argument, so the planner will not hoist it —
expect one call per candidate row. At household scale (hundreds of transactions per hub, arrays
of ≤4 uuids for Free) this is immaterial. If it ever bites, the escalation is a
`budget_cycles.visible_from` column maintained by trigger, not a redesign of the predicate. Not
now.

### The windowing mechanism — the client's side of the contract

This is the part the brief asked to have explicit before any SQL, and it contains one **certain
regression** that must be shipped ahead of the policies.

**Today the server over-returns and the client subtracts.** The nudge is derived from that
over-return:

```js
// LogView.jsx:78, DailyView.jsx:74, PaydayView.jsx:86 — identical in all three
const historyLocked = hubPlan === 'free' && cycles.length > visibleCycles.length && nav.isOldest;
```

`cycles` is the full server response; `visibleCycles` is the client window. Once the server
enforces the window, **`cycles.length === visibleCycles.length` always**, `historyLocked` is
permanently `false`, and the "history locked — upgrade" prompt disappears at exactly the moment
the lock becomes real. Free users would hit a silent wall: three periods, no explanation, no
upsell. Worse for revenue than the leak.

**The fix — the client stops inferring the hidden count and asks for it.** New scalar RPC:

```
public.hub_history_meta(p_centre_id uuid) RETURNS json
  -- { tier, total_cycles, visible_cycles, hidden_cycles }
  -- STABLE, SECURITY DEFINER, membership-gated (safe to RAISE here — it is an RPC,
  -- never an RLS predicate), computed from the same visible_cycle_ids() helper.
```

`hidden_cycles` is a **count, not data** — the same minimal-disclosure posture as `hub_tier`
(which returns one tier string and nothing about the subscription). It tells the UI "9 periods
are behind the wall" without returning a single hidden row.

So the mechanism, stated plainly:

| Concern | Before | After |
|---|---|---|
| Which cycles the user may read | server returns all; client slices to 3 | server returns 3 (+ current); client slice is now a redundant second application of the same rule — kept as defence in depth and for the pre-`hubPlan` frame |
| Which cycle is "active" | resolved from the full list | resolved from the returned list — **safe only because the helper unions the current cycle** |
| "N periods hidden" nudge | inferred from `cycles.length - visibleCycles.length` | read from `hub_history_meta().hidden_cycles` |
| Transactions of hidden periods | fully readable via REST | blocked by the restrictive policy |

The client never needed rows it wasn't allowed to display; it only needed the *count* of what it
was hiding. Replacing an inference with a scalar is the whole mechanism.

**Ordering consequence (matters):** `hub_history_meta` computes `hidden_cycles` from
`visible_cycle_ids`, so it reports the correct number **while the server is still returning
everything**. The client change is therefore a no-op refactor if deployed first, and a
regression fix if deployed after. **Ship the client change before the policies** (Steps 2 → 5/6
in the run-list).

### MUST-PASS — legitimate access that must still work

| # | Actor | Action | Expected |
|---|---|---|---|
| 2.1 | any member, **Pro** hub | Read every cycle, navigate to the oldest, read its transactions | ✅ Pro branch returns all ids. **The `NULL`-array footgun would surface exactly here** — the assertion in the helper's `DO` block is aimed at this row. |
| 2.2 | **standard** member, **Pro** hub | Same as 2.1 | ✅ Owner-tier resolution, not viewer-tier. A standard member on a paid hub must see all of it. |
| 2.3 | any member, **Free** hub | Load the dashboard — current period resolves, transactions load | ✅ Guaranteed by the current-cycle union |
| 2.4 | any member, Free hub | Add a transaction / category / income source in the current period | ✅ Insert **and** its `RETURNING` round-trip both succeed |
| 2.5 | Free hub with **3 future periods created** | Load the dashboard | ✅ Current period still visible — **the lockout scenario; test it deliberately, it will not occur by accident** |
| 2.6 | Free hub member | Navigate back through periods 1→2→3 | ✅ All three load with their rows |
| 2.7 | Free hub member | Reach the oldest visible period | ✅ `historyLocked` true, nudge renders with the correct hidden count |
| 2.8 | owner, Free hub | Create a new budget period; rollforward runs | ✅ RPC path; new cycle becomes newest, oldest drops out of the window (expected, non-destructive — the rows still exist) |
| 2.9 | member with a stale `activeCycleId` pointing at a now-hidden cycle | Load a view | ✅ Existing `visibleCycles.find(…) ?? activeCycle` fallback covers it — verify, don't assume |
| 2.10 | guest session (if any read path exists — **preflight P5**) | Whatever it reads today | ✅ Unchanged |
| 2.11 | hub upgraded Free→Pro mid-session | Reload | ✅ Full history returns |

### MUST-FAIL — the bypass, now blocked

| # | Actor | Action | Expected |
|---|---|---|---|
| 2.12 | Free-hub member, own token, curl | `GET /rest/v1/budget_cycles?budget_centre_id=eq.X` | ❌ Returns ≤ 4 rows (3 + current), not all |
| 2.13 | Free-hub member, curl | `GET /rest/v1/transactions?budget_centre_id=eq.X` (no date filter) | ❌ Only rows in visible cycles |
| 2.14 | Free-hub member, curl | `GET /rest/v1/transactions?cycle_id=eq.<hidden cycle>` | ❌ Empty |
| 2.15 | Free-hub **owner**, curl | Same as 2.12–2.14 | ❌ Also blocked — restrictive policy ANDs over the `FOR ALL` owner policy. This row is the reason the design uses RESTRICTIVE. |
| 2.16 | Free-hub member, curl | `GET /rest/v1/budget_categories` with no month filter | ❌ Only visible-cycle categories (plus legacy `cycle_id IS NULL`, by design) |

### Destructive vs reversible

**Fully reversible, non-destructive** — new policies and new functions only; no existing policy
is edited, no row is touched. Inverse is `DROP POLICY <table>_history_window ON <table>` ×4 plus
`DROP FUNCTION`. Restoring is a four-line paste.

**But the failure mode is the worst in the sweep, and it is silent.** A wrong predicate makes
rows *disappear* rather than error — and §12 of CLAUDE.md exists because this codebase has
already shipped one incident where RLS-filtered reads returned `200 []` and the app rendered it
as an empty dashboard. A restrictive policy produces exactly that signature: **200, empty, no
error, `loaded === true`, empty state rendered**. Neither the truthful-error layer nor the
`waitForSession` token gate detects it — by design, those guard a different cause.

Concretely: run Steps 5 and 6 as **separate** pastes with a full app pass between them, and treat
"the app looks fine" as insufficient — check row counts, not just that a screen rendered.

---

## Leak 3 — Member cap: owner-only bypass

### Before

`scripts/rls_budget_centre_members.sql` — 4 policies, all PERMISSIVE:

| Policy | Cmd | Predicate |
|---|---|---|
| `budget_centre_members_insert` | INSERT | `WITH CHECK (is_budget_centre_owner(budget_centre_id))` |
| `budget_centre_members_select` | SELECT | `USING (is_budget_centre_member(budget_centre_id))` |
| `budget_centre_members_select_owner` | SELECT | `USING (is_budget_centre_owner(budget_centre_id))` |
| `budget_centre_members_update` | UPDATE | `USING (is_budget_centre_owner(budget_centre_id))` — **no `WITH CHECK`** |

The brief's framing is exactly right: the policy is narrow (owner-only) but the owner is the
party MEM01 constrains, so the gate is open to precisely the wrong person. And as with Leak 1,
there is a **second door**: no `WITH CHECK` on UPDATE and no `deleted_at IS NULL` in `USING`
means an owner can resurrect removed members — a `PATCH` setting `deleted_at = null` restores
members above the cap without ever inserting.

### What actually writes to this table

`src/services/members.service.js` is the only client module touching it:

| Function | Mechanism |
|---|---|
| `getMembers` | direct `.select()` |
| `updateMemberRole` | direct `.update({ role })` |
| `removeMember` | direct `.update({ deleted_at })` |
| — | **no insert anywhere in `src/`** |

Both legitimate inserts are `SECURITY DEFINER` RPCs: `create_hub` (owner's own member row,
`create_hub.sql:122`) and `accept_invite` (the invitee's row, with its MEM01 backstop). Same
situation as Leak 1 — the INSERT policy grants nothing any client path uses.

### After — recommended

```
budget_centre_members_insert   INSERT   WITH CHECK (false)

budget_centre_members_update   UPDATE   USING      (is_budget_centre_owner(budget_centre_id) AND deleted_at IS NULL)
                                        WITH CHECK (is_budget_centre_owner(budget_centre_id))
```

This reconciles the cap without the owner-only gap: membership is *only* obtainable through
`accept_invite`, which counts active members and raises MEM01 — and `create_invite`, which counts
active + pending. Both resolve the **owner's** tier. Deny-direct-insert makes those two RPCs the
sole path in, which is what makes MEM01 a real ceiling rather than a front-door courtesy.

Note the asymmetry that already exists and is preserved: `create_invite` counts active+pending
(issuance gate), `accept_invite` counts active only (race-proof ceiling, Decision D8). Nothing
here changes either.

### MUST-PASS

| # | Actor | Action | Expected |
|---|---|---|---|
| 3.1 | owner, Free hub with 1 member | Invite + invitee accepts → 2 members | ✅ `accept_invite` RPC, RLS not applied |
| 3.2 | owner, Pro hub | Invite up to 15 | ✅ Owner-tier limit unchanged |
| 3.3 | **new user** | Sign up → `create_hub` → own owner member row created | ✅ RPC path. **Highest-stakes MUST-PASS in the sweep** — if `FORCE ROW LEVEL SECURITY` is on (preflight P2), `WITH CHECK (false)` breaks account creation for every new user. |
| 3.4 | owner | Change a member's role (standard ↔ full_access) | ✅ Live row passes `deleted_at IS NULL` |
| 3.5 | owner | Remove a member | ✅ Old row is live; soft-delete is a live→deleted UPDATE |
| 3.6 | any member | See the member list | ✅ SELECT untouched |
| 3.7 | owner | Re-invite a previously removed member | ✅ Goes through invite → `accept_invite`, which **inserts a new row** rather than resurrecting the old one — confirm `accept_invite` doesn't try to un-delete, or 3.7 becomes a MUST-FAIL by accident. **Check this before writing Step 4.** |

3.7 is the one place this step could plausibly break a real flow. It needs a read of
`accept_invite`'s already-a-member branch before the SQL is finalised.

### MUST-FAIL

| # | Actor | Action | Expected |
|---|---|---|---|
| 3.8 | owner of a Free hub at 2/2, own token, curl | `POST /rest/v1/budget_centre_members` | ❌ 42501 |
| 3.9 | owner, curl | `PATCH deleted_at=null` on a removed member | ❌ Blocked |
| 3.10 | non-owner member, curl | `POST` a member row | ❌ Already blocked before this change; stays blocked |

### Destructive vs reversible

**Fully reversible, non-destructive.** Inverse: re-run `scripts/rls_budget_centre_members.sql`.
Blast radius if P2 is wrong: **new-user signup breaks** — the highest-visibility failure in the
sweep, which is why Leak 3 runs after Leak 1 (same shape, lower stakes) and is verified with a
fresh test account immediately.

---

## Helper inventory

### Is `hub_tier()` reusable?

**In RPC bodies and for client display: yes, it already is. Inside an RLS policy: no — and
using it there would be an outage, not a bug.** Three independent reasons:

1. **It raises.** `hub_tier.sql:76-80` raises `42501 'not a member of this hub'` for a
   non-member. In an RLS predicate, a raise **aborts the entire query** rather than excluding a
   row. Qual evaluation order is not guaranteed, so the predicate can be evaluated against a
   row from a hub the caller doesn't belong to before the membership qual filters it — turning
   a filtered read into a failed one. This is the decisive reason.
2. **Wrong shape.** It answers "what tier is this hub", not "may this row be read". Every policy
   would still need the rank-within-hub computation, which is the actual work.
3. **Its own docstring rules it out.** `hub_tier.sql` states it is *"NOT AN ENFORCEMENT
   BOUNDARY… the direct-write cap bypass and the history REST leak are a SEPARATE, still-open
   RLS sweep — this file is not it, and must not be cited as closing them."* Promoting it into
   a policy would quietly make that comment false.

### New helpers required

| Helper | For | Why new | Security |
|---|---|---|---|
| `visible_cycle_ids(uuid) → uuid[]` | Leak 2, all four policies | Rank-within-hub can't be expressed in a policy on the same table without recursion | `SECURITY DEFINER` (mandatory — escapes RLS recursion), `STABLE`, `search_path=public`, **non-raising**, never `NULL`. Not an authz boundary; the untouched permissive membership policies remain the gate, so no membership check is needed inside it. |
| `hub_history_meta(uuid) → json` | Leak 2, the client nudge | The hidden count can no longer be inferred client-side | `SECURITY DEFINER`, `STABLE`, **membership-gated with a raise** (safe: called as an RPC, never as a predicate). Returns counts + tier only — never a hidden row. `REVOKE … FROM anon`, `GRANT … TO authenticated`, per §9.6 and the `hub_tier` precedent. |

**Leaks 1 and 3 need no helper at all** — that is a direct consequence of choosing deny-direct-write
over a tier-aware predicate, and it is most of why those two steps are low-risk.

Both new helpers follow the repo's established file shape: `BEGIN; … COMMIT;` with a
self-asserting `DO` block (signature, `prosecdef`, `provolatile='s'`, pinned `search_path`,
grants present, `anon` revoked, dependencies exist) that raises and rolls back the whole
transaction on any failure — same as `hub_tier.sql`. Two assertions specific to this sweep,
both aimed at footguns identified above: **`visible_cycle_ids` never returns `NULL`**, and
**the policy text contains the current-cycle union**.

### One thing this sweep should not silently do

`visible_cycle_ids` would be the **sixth** verbatim copy of the owner-tier resolution
(`hub_tier`, `create_category`, `create_categories_bulk`, `create_invite`, `accept_invite`,
`update_centre_skin`, plus `resolveSubscription` in JS). Every one carries a "keep in sync"
comment. Extracting a shared `owner_tier(uuid) → text` internal is tempting — and is **out of
scope here**, because it would mean editing five live revenue RPCs during a security sweep. See
[D4](#open-decisions).

---

## Client changes that must ship with the SQL

Only Leak 2 needs any client change. Leaks 1 and 3 are server-only — no client path uses the
doors being closed.

| # | File | Change | Ships |
|---|---|---|---|
| C1 | `src/lib/cycles.js` | `visibleCycleWindow(cycles, limit, today)` — union the cycle containing `today` into the newest-N result, mirroring the helper exactly | **before** Step 5 |
| C2 | `src/services/subscriptions.service.js` (or a new `cycles.service` read) | `getHubHistoryMeta(centreId)` → `rpc('hub_history_meta')`, `{ data, error }`, §12-truthful | before Step 5 |
| C3 | `src/hooks/useFinance.js` | Fetch meta alongside `loadCycles`; expose `hiddenCycleCount` | before Step 5 |
| C4 | `src/context/FinanceContext.jsx` | Add `hiddenCycleCount` to the documented contract | before Step 5 |
| C5 | `LogView.jsx:78`, `DailyView.jsx:74`, `PaydayView.jsx:86` | `historyLocked = hiddenCycleCount > 0 && nav.isOldest` — drop the `cycles.length > visibleCycles.length` inference (and with it the now-redundant `hubPlan === 'free'` term, since `hidden > 0` is only ever true on a capped hub) | before Step 5 |
| C6 | tests | `lib/cycles.test.js` for the union; view tests for the nudge driven by `hiddenCycleCount`; a `useFinance` test asserting the current cycle resolves when it is not in the newest-N | with C1–C5 |

C1 and C5 are the load-bearing ones: **C1 prevents the lockout, C5 prevents the silent-wall
regression.** Both are safe to deploy while the server still returns everything — C1 is a no-op
when the current cycle is already in the newest-N, and C5 reads a number the RPC computes
correctly regardless of whether the policies are live.

Per CLAUDE.md §8, C6 is not optional, and the count in the commit message moves accordingly.

---

## Ordered run-list

For the Supabase SQL editor, one paste per step, **in this order**. Every step is its own
transaction with its own self-asserting `DO` block. Nothing proceeds if a step's verification
raises.

| Step | What | Kind | Depends on | Verify before continuing |
|---|---|---|---|---|
| **0** | Preflight P1–P5 | read-only | — | Repo policy files match prod; `relforcerowsecurity` is **false** everywhere; P5 answered |
| **1** | `visible_cycle_ids.sql` + `hub_history_meta.sql` | additive functions | Step 0 | `DO` blocks pass; spot-check both against a Free hub and a Pro hub. **No behaviour change yet** — nothing calls them. |
| **2** | Deploy client C1–C6 | app deploy | Step 1 (RPC must exist) | Nudge still renders with the correct count; current period resolves; full test suite green |
| **3** | `rls_budget_categories` v2 — INSERT deny + UPDATE resurrection guard | policy edit | Step 0 | MUST-PASS 1.1–1.7, MUST-FAIL 1.8–1.11 |
| **4** | `rls_budget_centre_members` v2 — INSERT deny + UPDATE resurrection guard | policy edit | Step 3 green, MUST-PASS 3.7 pre-checked | MUST-PASS 3.1–3.7 (**3.3 with a genuinely new account**), MUST-FAIL 3.8–3.10 |
| **5** | `budget_cycles_history_window` restrictive policy | new policy | Steps 1, 2 | MUST-PASS 2.1–2.3, 2.5–2.9; MUST-FAIL 2.12, 2.15 |
| **6** | `<table>_history_window` on `transactions`, `budget_categories`, `income_sources` | new policies | Step 5 green | MUST-PASS 2.1–2.11 in full; MUST-FAIL 2.13, 2.14, 2.16 |
| **7** | Full verification matrix, both directions, all four role×tier combinations | test accounts | Step 6 | Everything below |

Ordering rationale:

- **1 before everything** — additive and inert; the helpers can be inspected against real data
  with zero risk before any policy depends on them.
- **2 before 5** — the client change is a no-op pre-enforcement and a regression fix
  post-enforcement. Reversing this order ships a silent wall to Free users.
- **3 before 4** — identical shape (deny direct INSERT + close resurrection), but Leak 1 fails
  visibly on a category add while Leak 3 can break **new-user signup**. Prove the pattern on the
  cheap table first.
- **5 before 6, separately** — the two halves of Leak 2 fail the same silent way (`200 []`). Split
  so a lockout is attributable to one paste rather than four policies at once.
- **6 last** — largest surface, most tables, worst failure mode.

Steps 3 and 4 are independent of 5 and 6. If Leak 2's scoping ([D1](#open-decisions)) is still
open, Steps 3 and 4 can ship on their own and close two of three leaks.

---

## Rollback

Every step is a one-paste inverse. No step reads, writes, or deletes a row, so there is nothing
to restore — only access rules to put back.

| Step | Inverse | Notes |
|---|---|---|
| 1 | `DROP FUNCTION public.visible_cycle_ids(uuid); DROP FUNCTION public.hub_history_meta(uuid);` | Must come **after** rolling back 5 and 6 — the policies depend on the helper |
| 2 | Revert the deploy (Vercel) | Independent of the SQL in both directions |
| 3 | Paste the **ROLLBACK block in the header of `scripts/rls_budget_categories.sql`** (or `git show c926499:scripts/rls_budget_categories.sql`) | **Not** a re-run of the file — it is now v2 and re-running it *reapplies* the fix. The block restores v1's `_insert` and `_update`; the 2 SELECT policies are unchanged across v1/v2 |
| 4 | Re-run `scripts/rls_budget_centre_members.sql` verbatim (idempotent) | Correct **only until Step 4 is written**. That step edits this file in place the same way Step 3 did, and must land its own header ROLLBACK block and update this row — otherwise this line silently becomes an instruction to reapply the change it claims to undo |
| 5 | `DROP POLICY budget_cycles_history_window ON budget_cycles;` | Existing 2 policies were never edited |
| 6 | `DROP POLICY <table>_history_window ON <table>;` ×3 | Existing policies were never edited |

The reason rollback is this clean is the design choice made up front: **restrictive policies add
a clause instead of editing one.** Nothing that currently works is rewritten, so "undo" is
"drop the thing I added" rather than "reconstruct what was there".

Reversibility does not make it safe to run unattended. `200 []` is indistinguishable from
"no data" to every layer of this app (§12) — if a step is wrong, the app will not tell you, a
test account will.

---

## Verification matrix

Run at Step 7, and at each step's own gate. Two directions per cell — *legitimate access still
works* and *the bypass is blocked* — because a policy that fails only in the second direction
looks identical to a policy that fails in both.

|  | Free hub | Pro hub |
|---|---|---|
| **owner** | 1.2, 1.5, 1.6 · 2.3, 2.5, 2.7, 2.8 · 3.1, 3.4, 3.5 · **MUST-FAIL** 1.8, 1.10, 2.12, 2.15, 3.8, 3.9 | 1.1 · 2.1, 2.8, 2.11 · 3.2 · MUST-FAIL 1.9 |
| **full_access** | 1.2, 1.5 · 2.3, 2.6, 2.7 · 2.8 (can create periods) | 1.1 · 2.1 |
| **standard** | 1.2, 1.5 · 2.3, 2.6, 2.7 · **MUST-FAIL** 1.8, 2.13, 2.14 | **1.1, 2.2** ← the owner-tier rows; a viewer-tier regression shows up here first |
| **new user** | **3.3** (signup → `create_hub`) | — |
| **guest** (if P5 says a read path exists) | 2.10 | 2.10 |

`docs/qa/fixture-accounts.md` already documents the role fixtures; the Free/Pro axis needs a
hub whose **owner** is Pro with a **standard member who is not**, which is the configuration
that catches every viewer-vs-owner tier regression in one account.

Direct-REST checks (the MUST-FAIL column) need a real user JWT against
`https://<project>.supabase.co/rest/v1/…` with the anon key — not the SQL editor, which runs as
a privileged role and will happily return everything, proving nothing.

---

## Open decisions

Five calls needed before any SQL is written. D1 is the one that changes the size of the work.

**D1 — Leak 2 scope: cycles only, or all four tables?**
Recommendation: **all four (Steps 5 + 6).** Gating `budget_cycles` alone hides the period picker
while leaving every transaction, category and income source readable by `budget_centre_id` with
no filter — the client-side window re-implemented one layer down, not enforcement. If four
tables is more appetite than this deserves right now, the coherent smaller option is **defer
Leak 2 entirely** and ship Steps 3 + 4, rather than ship a cycles-only gate that reads as
enforcement in the backlog but isn't.

**D2 — Does Decision D3 ("soft Pro nudge over the user's OWN data, not a privacy boundary")
still stand now that money is real?**
The backlog entry flags this and it is genuinely a product call, not an engineering one. It is
the user's own financial history behind the wall. Steps 5 and 6 only make sense if the answer is
"history is a paid capability and the server should say so". If the answer is "it stays a soft
nudge", close Leak 2 as *won't fix* with the reasoning recorded — that is a legitimate outcome
and cheaper than either alternative.

**D3 — Category relocation (MUST-FAIL 1.12): trigger, or accept?**
Recommendation: **accept for now, record it.** The complete fix is a `BEFORE INSERT OR UPDATE`
trigger enforcing CAT01 at the storage layer, which would subsume all three category bypasses —
but it is the only piece of this sweep that can break a legitimate write (a Pro→Free downgraded
hub with 40 live categories fails its next rollforward), and relocation is the weakest of the
three bypasses: it concentrates categories you already have rather than creating new ones.

**D4 — The sixth copy of the owner-tier lookup.**
Recommendation: **accept the duplication in this sweep.** Extracting a shared `owner_tier(uuid)`
means editing five live revenue RPCs during a security change — exactly the coupling that turns
a reversible sweep into an irreversible one. Add it to the backlog as a follow-on with its own
verification pass.

**D5 — Preflight P5 (guest read paths) — needs an answer before Step 6.**
A `RESTRICTIVE` policy applies to every role including `anon`. If guest sessions read
`transactions` through PostgREST, Step 6 gates them too, and the guest flow needs its own
MUST-PASS row. I did not trace the guest read path; `submit_guest_transaction` is a
`SECURITY DEFINER` **write** and is unaffected either way.

---

*Design only. No SQL has been run. Nothing proceeds without your review of each policy.*
