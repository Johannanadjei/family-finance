# f1_layer3_lived_use.md — F1 RLS audit, LAYER 3: lived use (the accept direction)

**Status: GREEN — run 2026-07-16 against production.** This is the last gate of the F1
write-side audit. Layers 1 and 2 are recorded in `f1_write_probe.sql`, `f1_t4b_diag.sql`,
`f1_t4c_diag.sql` and `f1_layer2_rest.sh`.

---

## Why this layer exists

**Layers 1 and 2 only ever proved rejections.** Every result they produced is an attack
being shut: 42501 at the DB, 42501 over REST, 21000 at the PostgREST client layer. Not one
of them proves that `migrate_24`/`migrate_25` still *admit* legitimate work.

That gap is not academic. A gate that rejects everything passes every probe in this audit
with full marks. The failure mode of a too-tight policy is invisible to a suite that only
asks "is the attack blocked?" — it shows up as an owner unable to confirm payday, or a
standard member unable to log an expense. Only lived use in the real app tests that
direction, which is why this layer is manual and has no script.

Recorded per [[lived-use-is-verification]]: green tests, green audit and green SQL probes
are not "production stable" until someone has actually clicked through.

---

## THIS LAYER IS NOT A SCRIPT — AND THAT IS DELIBERATE

The other layers automate because they fire *forbidden* writes, where a rollback wrapper
(layers 1) or a snapshot + hard gate (layer 2) is what makes them safe to run. Layer 3
fires *permitted* writes through the shipped UI. There is nothing to contain: the writes
are supposed to land, and they are supposed to stay. Automating it would only re-test the
service layer, which the 1557-test suite already covers, while skipping the thing that
actually matters — that the whole stack, from a real session through PostgREST to the
policies, lets real users do their jobs.

---

## THE BLOCKER THIS LAYER HIT FIRST — CYC02 (and how it was misread)

The first attempt failed with `400 / CYC02 "No cycle exists containing date 2026-07-16 in
centre 0d3ccc2e"`. The fixture hub had only a June 2026 cycle (ending `2026-06-30`) and the
writes were dated today.

**A CYC02 result is INCONCLUSIVE, in BOTH directions.** `resolve_cycle_id()` is a BEFORE
INSERT trigger on both `transactions` and `income_sources`, and **BEFORE triggers run
before the RLS WITH CHECK**. The write dies upstream and never reaches the gate. It was
briefly recorded as "confirms the F1 gates aren't rejecting legitimate owner writes" — it
confirms nothing of the sort. It is the same class of error as the T2 inversion that cost
this investigation a session: *a result that never reached the mechanism cannot be evidence
about the mechanism.* `f1_write_probe.sql` already says this (lines 59–66, and its
classifier at 274/306/374: `INCONCLUSIVE [CYC02] trigger fired before RLS`) and guards its
own setup by asserting cycle coverage before starting (lines 237, 242). The live app has no
such guard — hence the trap.

**Resolution — and the rule that was not there.** There is no "start must be in the future"
rule. `CreateBudgetPeriodSheet.saveCustom` validates exactly three things (dates parse,
`end >= start`, `isWithinCurrentYear`); the server (`create_budget_period`, migrate_16/17)
adds only CYC01 overlap and CYC03 year. What *looks* like a rule is two next-month
**pre-fills**: the quick-create button is hardcoded to `nextCalendarMonthRange`, and
"Custom period" pre-fills the DD/MM/YYYY fields from the same range. They are editable.
A July 2026 period (`2026-07-01` → `2026-07-31`) was created by overwriting the pre-fill,
with copy-categories on (categories are cycle-scoped; a fresh period has none, and the
standard member's expense test needs one).

Two paths were considered and rejected:

- **Impersonated RPC** (`SET LOCAL request.jwt.claims`, as layers 1 did) — would work, but
  it is more machinery than two clicks and writes through the SQL editor rather than the
  path the app ships. Reserve impersonation for what the UI cannot reach.
- **Testing in a different hub** — actively harmful. It requires adding the standard member
  to a second hub, which breaks SAFEGUARD 1 (the single-membership assertion) in
  `f1_write_probe.sql` and `f1_t4b_diag.sql` — the guard that bounds the unqualified-UPDATE
  blast radius. That trades a two-click fix for permanently disarming the safety rail on
  every future layer-1 re-run.

**Related gotcha, worth knowing before reading Payday.** `getActiveCycle` (`lib/cycles.js`)
resolves in three tiers: the cycle containing today, else **the most recent past cycle**,
else the earliest future one. With June (past) and a stray August (future) present and
nothing containing today, Payday renders **June** — a newly created future period looks
like it "didn't appear" when in fact the past tier won. Once July existed it contained
today and took tier one outright.

---

## THE PASS CRITERION — persistence, NOT silence

**"No error toast" is not a pass.** Every write in this app is optimistic-update +
rollback (§5). An RLS rejection does not necessarily surface as an error: it surfaces as
the value appearing and then quietly reverting. `markReceived` is two-phase and rolls back
*both* phases if either fails, so a rejected income-transaction insert flips the source
back to pending on its own — which reads like a mis-tap, not a permission failure.

The criterion is therefore **the value persists after a hard refresh**. This is the same
discipline as the T2 inversion, pointed the other way: there, absence of a rejection was
not proof of a hole; here, absence of an error is not proof of a pass.

---

## ENVIRONMENT

| | |
|---|---|
| App | `family-finance-plum.vercel.app` (production) |
| DB | shared project `oxpwgpugvucsqnzixafi` — dev/staging/main all point here |
| Hub | `0d3ccc2e…` (fixture) |
| Members | owner `8b453c16…`, standard `3a36d46c…` |
| Cycle | July 2026 (`2026-07-01` → `2026-07-31`), created for this run |

Note the shared project means `migrate_24`/`migrate_25` went live for real users when they
were applied (2026-07-16), not at promotion. There is no src diff between dev and main for
this workstream — this layer verifies a change that was already in production, and
promotion moves only the SQL source-of-truth and this audit trail.

---

## RESULT LOG — run 2026-07-16, all GREEN

Every row below persisted after a hard refresh.

| Step | Actor | Action | Policy exercised | Result |
|---|---|---|---|---|
| 1 | owner | create July income source | `income_sources_insert` WITH CHECK `can_view_income` | **ACCEPTS** — path (b) |
| 2 | owner | Confirm Received | `income_sources_update` + `transactions_insert` (`type='income'`) | **ACCEPTS** — paths (a)+(b) together |
| 3 | owner | Mark as Pending | reverse two-phase (source update + income-tx soft delete) | **ACCEPTS** — reverted and stayed |
| 4 | standard | add expense | `transactions_insert` (`type='expense'`) via migrate_24 | **ACCEPTS** |
| 5 | standard | edit expense | `transactions_update`, expense post-image | **ACCEPTS** |
| 6 | standard | delete expense | `transactions_update` (soft delete), expense post-image | **ACCEPTS** |

Step 2 is the load-bearing one: `markReceived` crosses both tables in one user action, so
it exercises migrate_24 and migrate_25 together in the accept direction. Step 3 matters
because the reverse write is a *different statement shape* from the confirm — a soft delete
whose post-image is still `type='income'`, which the type-aware WITH CHECK must admit for a
role holding `can_view_income`.

**No role is over-blocked. Combined with layers 1–2, the audit now proves both
directions:** attacks rejected, legitimate work accepted.

---

## THE `full_access` GAP — CLOSED BY READING, NOT BY A FIXTURE ACCOUNT

**Do not create a `full_access` fixture member to "finish" this layer. That account was
deliberately not created. This section is why.**

**The gap.** `can_view_income` admits `owner` and `full_access` (the DB mirror of
`roles.js` `PERMISSIONS[role].viewIncome`), so `full_access` must retain income writes
after migrate_25. No layer ever ran as that role. It appears in `f1_write_probe.sql:204`
and `f1_t4c_diag.sql:124` only inside the setup guard that resolves the owner control —
`role IN ('owner','full_access')`, an accept-either matcher for whichever account that is.
It was never a probe subject. The fixture hub has only owner + standard; there is no
`full_access` member.

**Why reading is conclusive here — the argument, in order:**

1. **Every income write gate is the same single predicate.** Per the source-of-truth
   overlays (`rls_income_sources.sql`, `rls_transactions.sql`): `income_sources_insert`
   WITH CHECK `can_view_income`; `income_sources_update` USING + WITH CHECK
   `can_view_income`; `transactions_insert`/`transactions_update`
   `is_budget_centre_member AND (type = 'expense' OR can_view_income(...))`. There is no
   second path.
2. **There is no owner bypass on the write paths.** The `_select_owner` policies
   (`is_budget_centre_owner`) are SELECT-only. So the owner's writes are gated by
   `can_view_income` too — the identical predicate `full_access` would hit.
3. **The live function is therefore already proven working by the owner controls.** T8a/T8b
   and T4c owner-1 passed, and those writes went *through* `can_view_income`. It is
   installed, reachable, and returns true for a role in its list.
4. **The only residual question is whether `'full_access'` is in that list — and the body
   is a flat role test with no indirection.** Verified against the LIVE definition
   (`pg_get_functiondef` via `pg_proc`, 2026-07-16): exactly one row, no overload,
   SECURITY DEFINER, STABLE, body `role in ('owner', 'full_access')`.

`full_access` is admitted exactly where `owner` is. There is no ambiguity in the logic for a
test to resolve.

**Why the LIVE definition and not `scripts/can_view_income.sql`.** The repo file is an
artifact that *claims* what was applied. This investigation's own lesson — "correct policy
text is not a closed attack" (see `6db323e`) — inverts cleanly: a correct repo file is not
a correct installed function. One read-only query removes the assumption. Check two things
in the output, not one: that the body contains `role in ('owner','full_access')`, **and
that exactly one row returns** — a second overload would mean the policies might bind a
different function than the one being read, which is the only way the flat-logic argument
breaks.

```sql
SELECT p.oid::regprocedure AS signature,
       p.prosecdef, p.provolatile,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'can_view_income';
```

**Why a fixture account would have been worse, not merely redundant.** It would re-derive,
through a slower and *mutating* path, what the predicate states plainly — while adding a
permanent third member to the fixture hub. That is state every future probe has to reason
around, for a conclusion already established on stronger evidence.

**When this gap reopens.** If `can_view_income` ever gains indirection — a permissions-table
join, a per-hub override, anything that is not a literal role list — the flat-logic argument
dies and `full_access` needs a real subject. Re-read the live definition before relying on
this section.
