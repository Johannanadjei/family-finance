# Stage 1 QA Fixture Accounts — Seeding Register

**Purpose:** Stage 1 UI smoke + visual-regression tests are **stop-before-submit** and never write to the (single, shared, production) Supabase project. To exercise states the suite can't create — at-cap gates, Pro tier, history wall, standard-role — they instead **read** accounts that already sit in those states. This file is the manual seeding runbook for those **7 accounts: 6 primary fixtures + 1 supporting member** (`mem-cap-member`, the standard-role invitee).

- **Spec:** [`phase-1-stage-1-coverage.md`](./phase-1-stage-1-coverage.md) §0.1.
- **Identity source of truth:** [`src/lib/fixtures.js`](../../src/lib/fixtures.js) — `STAGE_1_FIXTURE_EMAILS` (all 7). **This doc is the source of truth for the seeding state of all 7, including the supporting member.** Keep emails here and in `fixtures.js` in sync.
- **Who seeds:** AJ, by hand, **once**, after the register commit lands. The seeding writes are the **single sanctioned exception** to Stage 1's "no writes" rule — done outside the suite, by a human.
- **DB:** the shared project `oxpwgpugvucsqnzixafi` (there is no separate dev/test DB yet — memory #5). Seeding here touches production; do it deliberately.

---

## Shared credentials

All 7 fixtures use **one** strong shared password (these are low-sensitivity, read-only QA accounts on a non-deliverable `@bos-test.com` domain with no real data):

```
Password:  Bos!Stage1-Fixt#2026
```

> Store the password in the team password manager as well. Do **not** vary it per account — a single value keeps Playwright config trivial. Rotate it (and re-seed) only if these accounts ever gain real data or write capability. The password is intentionally the *only* secret here and is NOT mirrored into `src/lib/fixtures.js`.

---

## The 7 fixtures

Free-tier caps in force (from `lib/plans.js`): **1 hub · 2 members · 10 categories/cycle · 2 income streams · 3 months history.**

### 1. `stage1-fixture-fresh@bos-test.com` — empty / from-zero
- **Covers:** onboarding render, HUB01 from-zero (no hubs yet).
- **Seed:**
  1. Sign up with the email + shared password.
  2. **Stop at the onboarding gate. Do NOT complete onboarding** — leave the account with **0 hubs** so it renders `OnboardingFlow`.
  3. If a PIN setup prompt appears, **Skip** it (PIN is optional; skipping keeps the dashboard reachable in other fixtures).
- **Verify:** logging in lands on `OnboardingFlow`; `budget_centres` has **0 rows** owned by this user.

### 2. `stage1-fixture-hub-cap@bos-test.com` — at hub cap (free)
- **Covers:** HUB01 **at-cap** HubFooter affordance ("Upgrade to add more hubs").
- **Seed:**
  1. Sign up; skip PIN.
  2. Complete onboarding to create **exactly 1 hub** (any name/currency; minimal categories/income is fine).
  3. **Do not create a second hub** (free cap = 1).
- **Verify:** open the SidePanel → HubFooter shows the **upgrade** CTA, not "+ New BOS Hub". `budget_centres` = **1 row** for this user.

### 3. `stage1-fixture-cat-cap@bos-test.com` — at category cap (free)
- **Covers:** CAT01 affordance ("10 of 10" / locked add) in BudgetView **and** Settings.
- **Seed:**
  1. Sign up; skip PIN; complete onboarding with 1 hub.
  2. In the hub's current budget period, create categories until there are **exactly 10** (count any created during onboarding — total must be 10, the free cap).
- **Verify:** BudgetView shows **10/10**; tapping "+ Add" opens the **CATEGORY_CAP_BODY** UpgradeModal. `budget_categories` (current cycle, `deleted_at IS NULL`) = **10**.

### 4. `stage1-fixture-mem-cap@bos-test.com` — at member cap (free, owner perspective)
- **Covers:** MEM01 affordance ("2 of 2", invite locked) from the **owner's** view.
- **Seed:**

  > **Interleaved with #5.** Seeding mem-cap REQUIRES mem-cap-member to also be seeded mid-flow:
  > 1. Sign up #4 owner, complete onboarding
  > 2. Sign up #5 (in incognito or separate browser session)
  > 3. From #4's session: invite #5's email with Standard role
  > 4. From #5's session: accept the invite
  > 5. Verify from #4: Members section shows 2 of 2
  >
  > Use an incognito window or separate browser for #5 to avoid session conflicts.

  1. Sign up (owner); skip PIN; complete onboarding with 1 hub.
  2. Settings → Members → invite a **second** person with role **Standard**, using the email of fixture #5 below.
  3. Accept that invite from fixture #5's session (the invitee must be a real second auth user — `accept_invite` runs as the invitee).
  4. After acceptance: **2 members total** (owner + 1 standard) = free cap.
- **Verify:** Members section shows **2 of 2** and the invite control is disabled / shows MEM01 affordance. `budget_centre_members` (this hub, not deleted) = **2 rows**, one `role='standard'`.

### 5. `stage1-fixture-mem-cap-member@bos-test.com` — standard-role member (supporting fixture)
- **Its own fixture, also read-only.** This is the standard-role invitee that completes fixture #4, and it is **separately a Stage 1 fixture** used to capture the **standard-role** UI: `STAGE_1_FIXTURES.memCapMember` in `src/lib/fixtures.js`. This doc is the source of truth for its seeded state too.
- **Seeded mid-#4-flow, NOT standalone.** Do not seed this on its own — it is created and accepts its invite as part of fixture #4's interleaved sequence (see the callout at the top of #4). The steps below are that same flow restated from #5's side.
- **Covers:** standard-role AccessBlocked + role-variant visuals (Phase 1 §3 / §5).
- **Seed:**
  1. Sign up with this email + the shared password (in incognito / a separate browser from #4's owner session); skip PIN.
  2. Accept the invite from fixture #4 (step 3 above) — do **not** create a hub of its own; its only membership is the invited standard role in #4's hub.
- **Verify:** logging in as this account: FAB hidden; `/payday`, `/settings`, `/log` render AccessBlocked; income/balance cards hidden on `/`. It owns **0** hubs; appears as `role='standard'` in #4's hub.

### 6. `stage1-fixture-pro@bos-test.com` — Pro tier
- **Covers:** Pro state, Pro-skin visual baselines, Pro-side cap absence, owner baseline.
- **Seed (order matters — Pro must be set before extra hubs/categories, which the free cap would block):**
  1. Sign up; skip PIN; complete onboarding with 1 hub.
  2. **Mark Pro via direct SQL** (recommended over a real Paystack payment — faster, deterministic, no checkout). In the Supabase SQL editor:

     **2a. Verify the user_id exists FIRST** (defensive — confirm exact email before inserting):
     ```sql
     SELECT id, email FROM auth.users WHERE email = 'stage1-fixture-pro@bos-test.com';
     ```
     Must return **EXACTLY 1 row.** If **0 rows**, the signup didn't complete — go back to step 1. If **2+ rows**, something is wrong — **STOP and investigate** (do not run the INSERT).

     **2b. Then run the INSERT:**
     ```sql
     INSERT INTO subscriptions
       (user_id, tier, status, paystack_status, plan_interval,
        current_period_start, current_period_end)
     SELECT id, 'pro', 'active', 'manual_fixture', 'annual',
            now(), now() + interval '10 years'
     FROM auth.users
     WHERE email = 'stage1-fixture-pro@bos-test.com';
     ```
     A 10-year `current_period_end` keeps `resolveSubscription()` returning **pro** indefinitely (it expires on period end). The one-active-per-user unique index is satisfied (single active row).
  3. Re-login (or let `useSubscription` refresh) so the app resolves **pro**.
  4. Now create a **2nd hub** and **>10 categories** in one cycle to exercise Pro's raised caps.
- **Verify:** `SELECT tier,status,current_period_end FROM subscriptions WHERE user_id = (SELECT id FROM auth.users WHERE email='stage1-fixture-pro@bos-test.com');` → `pro / active / ~2036`. App: PlanSection shows Pro; ThemeSection Pro skins unlocked; HubFooter allows more hubs; categories exceed 10 with no cap modal.

### 7. `stage1-fixture-history@bos-test.com` — history wall (free)
- **Covers:** the soft history gate (free sees last 3 budget periods; older → upgrade affordance on PeriodNav prev arrow).
- **Seed:**
  1. Sign up; skip PIN; complete onboarding with 1 hub (stays **free**).
  2. Create budget periods until the hub has **at least 4** total (period creation is not gated — only *visibility* is): **4 non-overlapping custom periods within the current calendar year** (e.g. Jan/Feb/Mar/Apr 2026), so 3 are visible and ≥1 is behind the wall. The CYC01 overlap constraint and the within-this-year limit are both enforced by the `create_budget_period` RPC.
- **Verify:** on the oldest **visible** period, PeriodNav's prev arrow shows the locked affordance (`data-testid="upgrade-history-affordance"`) → HISTORY_CAP_BODY modal. `budget_cycles` (not deleted) ≥ **4 rows**.

---

## DO NOT TOUCH

Once seeded, these accounts are **immutable read-only Stage 1 fixtures.**

> **DO NOT TOUCH means: do not change the DB state.** Specifically — do not create, delete, or edit hubs / categories / members / transactions / cycles / settings; do not sign up to Pro; do not change the PIN; do not change the skin. Signing in and opening modals (incl. cap gates) is fine — tests will do this routinely. Inspecting elements, reading data, or navigating between views does NOT count as touching.

- **Never** edit data, add/delete a hub/category/member/transaction, or change settings/skin. Any mutation shifts the state the visual baselines and cap assertions were captured against → silent test drift.
- **Never** point a write-capable automated test at these emails. Stage 1's network rail blocks writes; Stage 2 must use its own dedicated test project, not these.
- **Never** delete the Pro subscription row or let it expire (the 10-year window guards against expiry).
- Treat the `@bos-test.com` accounts as production data that happens to be fixtures: changing them is a deliberate, logged re-seed (below), not casual use.

---

## When to re-seed

Re-seed (recreate the affected fixture from scratch, then re-capture any visual baselines that reference it) when:

1. **Schema / migration change** alters a table these fixtures depend on (`subscriptions`, `budget_centres`, `budget_centre_members`, `budget_categories`, `budget_cycles`) in a way that changes rendered UI.
2. **Cap values change** in `lib/plans.js` (e.g. free hub/member/category/history limits) — the at-cap fixtures must be re-leveled to the new threshold.
3. **Fixture corruption** — an accidental manual edit, a stray test write that escaped the rail, or the Pro row expiring/being removed.
4. **Copy / gate-code change** that the cap modals assert against (`planCopy.js`, gate SQLSTATE codes).

After any re-seed: re-run the §5 visual baselines for the affected fixture and commit the updated snapshots in the same change.
