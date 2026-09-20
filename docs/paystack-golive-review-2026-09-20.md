# Paystack Go-Live Review — 2026-09-20

**Read-only review.** Nothing in the repository was modified to produce this; no branch
was touched and no command with side effects was run. Every claim below is quoted from
source on disk at commit `b50c16a` (`main`), not recalled or inferred.

**Redaction:** any literal key or plan-code fragment found in the repo is shown truncated
to its prefix plus `[REDACTED]`. See §2 — all six hits are fabricated test fixtures, not
credentials.

**Contents**

1. [Go-live runbook (full)](#1-go-live-runbook-full)
2. [Every place Paystack keys / URLs / secrets are read](#2-every-place-paystack-keys--urls--secrets-are-read)
3. [Env var names](#3-env-var-names-names-only)
4. [The webhook](#4-the-webhook)
5. [What decides test vs live at runtime](#5-what-decides-test-vs-live-at-runtime)
6. [The subscriptions table](#6-the-subscriptions-table)
7. [Test-mode-only code paths](#7-test-mode-only-code-paths)
8. [Summary — what a live switch would actually change](#summary--what-a-live-switch-would-actually-change)

---

# 1. Go-live runbook (full)

Found at `docs/go-live-runbook.md` (546 lines).

`grep -ril "paystack" docs/ *.md` also hits `docs/backlog.md`,
`docs/engineering-decisions.md`, `docs/qa/phase-0a-inventory.md`,
`docs/qa/fixture-accounts.md`, `docs/qa/phase-1-stage-1-coverage.md`, and `CLAUDE.md`.

**CLAUDE.md has no Paystack section** — one incidental mention, line 450, inside §9.6,
naming `apply_subscription_event` as the example of a service_role-only RPC.

Reproduced verbatim below (fenced at five backticks because the runbook contains its own
fenced blocks).

> **Snapshot note.** This is the runbook **as it stood when the review was made** (546
> lines, commit `b50c16a`). The very next commit — the one that also carries this file —
> added a step to §5 requiring `GH_CHECKS_TOKEN` to be verified present *and unexpired*
> before the redeploy, with the exact Vercel path. `docs/go-live-runbook.md` is the live
> document; this embed is the reviewed state and is deliberately not kept in sync.

`````markdown
# Paystack Go-Live Runbook

**Status:** DRAFT — not yet executed. Paystack is in **test mode** as of 2026-09-02.
**Purpose:** an ordered, verifiable checklist for switching Paystack from test to live.
Execute it top to bottom. Do not improvise; if a step's verification fails, stop and
resolve before continuing.

**How to read this doc**

- `[ ]` — a step you tick when done *and* verified.
- **Verify:** — how you know the step actually worked. A step without a passing verify is not done.
- `[VERIFY IN DASHBOARD]` — state that lives in Paystack or Vercel and cannot be read from
  this repo. Confirm it by eye at execution time; nothing here asserts its current value.

**Repo facts this runbook is built on** (read from code 2026-09-02, not assumed):

| Fact | Source |
|---|---|
| Secret key var — API auth **and** webhook HMAC key | `api/paystack/checkout.js:104`, `webhook.js:147`, `manage-link.js:56` |
| **No separate webhook signing secret exists** | `webhook.js:9-12` — Paystack signs with `PAYSTACK_SECRET_KEY` |
| **No Paystack public key is used anywhere** | no `pk_test`/`pk_live`/`PaystackPop`/`inline.js` in `src/` or `api/` |
| Plan codes come from env, never from code | `checkout.js:42-45`, `resolvePlanCode()` |
| Callback URL is derived, not hardcoded | `checkout.js:33-38, 68-74` |
| Amounts are in code, not in the Paystack plan | `src/lib/pricing.js` — `4000` / `40000` pesewas |
| Production deploys are CI-gated, `main` only | `vercel.json` → `scripts/vercel-ignore-build.mjs` |

---

## 0. Complete env var inventory

These are the **exact** names read by the code. There are no others.

### Server-only (Vercel env vars — never `VITE_`-prefixed)

| Var | Read by | Changes at go-live? |
|---|---|---|
| `PAYSTACK_SECRET_KEY` | `checkout.js:104`, `webhook.js:147`, `manage-link.js:56` | **YES** — `sk_test_…` → `sk_live_…` |
| `PAYSTACK_PLAN_CODE_MONTHLY` | `checkout.js:43` via `resolvePlanCode('monthly')` | **YES** — test `PLN_` → live `PLN_` |
| `PAYSTACK_PLAN_CODE_ANNUAL` | `checkout.js:44` via `resolvePlanCode('annual')` | **YES** — test `PLN_` → live `PLN_` |
| `SUPABASE_URL` | all three routes (falls back to `VITE_SUPABASE_URL`) | No |
| `SUPABASE_SERVICE_ROLE_KEY` | all three routes | No |

### Client (bundled by Vite)

| Var | Read by | Changes at go-live? |
|---|---|---|
| `VITE_SUPABASE_URL` | `src/lib/supabase.js:3` | No |
| `VITE_SUPABASE_ANON_KEY` | `src/lib/supabase.js:4` | No |

**There is no `VITE_PAYSTACK_PUBLIC_KEY` and no `PAYSTACK_WEBHOOK_SECRET`.** If you find
yourself looking for either, stop — the design does not use them:

- **No public key.** `PricingView` → `checkout.service.startCheckout()` → `POST /api/paystack/checkout`
  → Paystack `transaction/initialize` → the client redirects to the returned
  `authorization_url`. Paystack's own hosted page collects the card. No Paystack JS ever
  loads in our bundle, so there is nothing client-side to swap. **Consequence: the entire
  go-live key change is server-side, which means no rebuild of the client bundle is needed
  for the keys — only a redeploy to pick up new env values.**
- **No webhook secret.** `webhook.js` computes `HMAC-SHA512(rawBody, PAYSTACK_SECRET_KEY)`
  and timing-safe compares it to `x-paystack-signature`. **Consequence: the moment you swap
  the secret key, webhook verification switches to live mode too. Any test-mode webhook
  still in flight or being retried will start returning 401. This is expected — see §5.**

### One var this repo reads that is easy to forget

`GH_CHECKS_TOKEN` (`scripts/vercel-ignore-build.mjs`) gates production deploys on green CI.
If it is unset, **production deploys silently skip** — which would leave you thinking you
deployed the live keys when you did not. Covered in §6.

---

## 1. Pre-flight — must be true before you touch anything

Nothing below is a Paystack action. These are the decisions that must be *made*, not
drifted into, because money becoming real changes their consequences.

- [ ] **Counsel decision: signed off, or consciously deferred.**
      The four legal docs (`src/content/legal/{terms,privacy,cookies,disclaimer}.md`) still
      carry `⚠️ DRAFT — pending qualified Ghanaian counsel review.` The DPC side is closed
      (registration C0067637698 is live in `privacy.md` §1.1); only the counsel gate remains.
      Decide explicitly: **(a)** counsel signs off → merge `feature/legal-counsel-review`
      (`345a97f`), remove the banner from all four docs and stamp "v1.0 final" in one commit;
      or **(b)** go live with the DRAFT banner standing, as a recorded decision.
      **Verify:** the decision is written down in `docs/backlog.md` with a date. Not "we
      talked about it."

- [ ] **DRAFT banner decision follows from the counsel decision — do not split them.**
      The banner is a truthfulness statement about the docs. If counsel has not signed off,
      the banner must stay; removing it without sign-off makes a public legal document lie.
      All four files move together or none do.
      **Verify:** `grep -l "DRAFT — pending" src/content/legal/*.md` returns either all four
      files or zero. Never a subset.

- [ ] **🚫 BLOCKER — rewrite the stale cancellation clause in `terms.md` §6.6.**
      **Do not swap the live key in §4 until this is fixed AND deployed.** Unlike the counsel
      and DRAFT-banner items above, this is not a decision to record — it is a false statement
      in a public legal document, and it becomes a misdescription of a *paid* product the
      moment real money is taken.
      It currently reads: *"In-account cancellation through your Account settings is not yet
      available and will be offered once that flow ships."* The cancel flow **shipped
      2026-09-02** (`797b3a6` — Paystack hosted manage link). Selling a paid plan under terms
      that misdescribe how to cancel it is exactly the class of problem the legal-docs
      truthfulness rule exists to prevent.
      The real path, read from code: **Settings → Plan → "Manage Plan"**
      (`views/settings/PlanSection.jsx` — the CTA reads "Manage Plan" once `isPro`) →
      `/pricing` → **"Manage subscription"** (`ManageSubscriptionButton` →
      `billing.service.getManageLink()` → `POST /api/paystack/manage-link`) → Paystack's own
      hosted page → cancel there. Access then runs to `current_period_end`
      (`apply_subscription_event.sql`: `not_renew` sets `cancel_at_period_end = true` and
      leaves `status = 'active'`).
      **Verify — all three, in order:**
      - `grep -n "not yet available" src/content/legal/terms.md` returns **nothing**.
      - §6.6 names that in-app path **and keeps the `info@moneybos.com` route**. Settings is
        `can('settings')`-gated (owner / full-access), so a standard member who bought Pro on
        their own account cannot reach the Plan section — the email route is what keeps the
        clause true for them. (Same lineage as the `/pricing` gating item below.)
      - **The deployed bundle carries it.** These docs are `?raw`-bundled into `App-*.js` via
        `LegalView.jsx`, so editing the `.md` is **inert until rebuild + deploy** — a
        source-only fix ships nothing and the public page keeps stating the false clause.
        Read §6.6 on the production deploy itself, not in the repo. This deploy is separate
        from, and must land **before**, the §5 redeploy.

- [ ] **`/pricing` gating decision — the last open CAT01-lineage item.**
      `App.jsx:108` mounts `<Route path="/pricing" element={<PricingView />} />` with **no
      role or tier guard**. `PricingView` keys only on the viewer's own `isPro`. The cap CTAs
      were gated by `useHubTier()` (shipped 2026-08-05), so no button leads a non-owner there
      — but a standard member who types the URL still reaches a live checkout that upgrades
      **their own account** while the hub's caps do not move.
      This is low severity (deliberate URL entry required) and an own-account Pro purchase is
      a legitimate product path — but with live keys, someone can spend real cedis for
      nothing that visibly changes. Decide one of:
      - **(a)** Gate the route on ownership (`AccessBlocked` for non-owners) — closes it fully.
      - **(b)** Leave ungated, and make `PricingView` copy explicit that a purchase upgrades
        *your account*, not *this hub*.
      - **(c)** Leave as-is, recorded as accepted risk.
      **Verify:** the choice is recorded in `docs/backlog.md` with a date. If (a) or (b),
      the change is deployed and tested *before* the key swap, not after.

- [ ] **Confirm the two remaining accepted gaps still read as acceptable with real money.**
      Write caps (categories, members) are RLS-enforced as of 2026-08-25. Still open by
      decision: the **history REST leak** (Leak 2 / D3 — `budget_cycles` returns all cycles;
      the 3-cycle Free window is client-side only in `visibleCycleWindow()`). D3's framing is
      "a soft Pro nudge over the user's OWN data, not a privacy boundary." That framing was
      set when no money was real.
      **Verify:** re-affirmed in writing, or fixed. Do not silently inherit it.

- [ ] **Tests and audit are green on the exact commit you intend to have live.**
      **Verify:** `npm test -- --run` (expect **1741** tests as of `797b3a6`) and
      `bash scripts/audit.sh` both zero-failure.

- [ ] **Paystack business account is fully activated for live transactions.** `[VERIFY IN DASHBOARD]`
      Live keys exist but are inert until Paystack approves the business (compliance docs,
      settlement bank account).
      **Verify:** Paystack dashboard shows the business as activated and a settlement account
      is attached. If it says "pending", **stop** — everything after §2 will fail confusingly.

- [ ] **Pick a low-traffic window and know who is watching.**
      **Verify:** you have ~60 uninterrupted minutes and access to both dashboards.

---

## 2. Paystack dashboard — create the LIVE Plan objects

Test-mode plans do **not** exist in live mode. Live mode needs its own `PLN_` codes, and
they will be different strings.

- [ ] **Toggle the Paystack dashboard to LIVE mode.** `[VERIFY IN DASHBOARD]`
      **Verify:** the dashboard's test/live switch reads **Live**. Everything in §2–§4 must
      be done with that switch on Live or you will create test objects and swap in codes
      that the live secret key cannot see.

- [ ] **Create the live Monthly plan.** `[VERIFY IN DASHBOARD]`
      Name: Pro Monthly. **Amount: GHS 40.00. Interval: Monthly. Currency: GHS.**
      **Verify:** the plan's amount equals `PRICING.monthly.amount` = `4000` pesewas
      (`src/lib/pricing.js`), and currency is `GHS` (`PRICING.currency`). A mismatch here
      does **not** fail loudly — `checkout.js` sends both `amount` (from `PRICING`) and
      `plan`; Paystack takes the first payment against the transaction and all recurring
      renewals against the plan. A wrong plan amount means the renewal silently differs from
      the first charge. Check the digits.

- [ ] **Create the live Annual plan.** `[VERIFY IN DASHBOARD]`
      Name: Pro Annual. **Amount: GHS 400.00. Interval: Annually. Currency: GHS.**
      **Verify:** equals `PRICING.annual.amount` = `40000` pesewas, currency `GHS`.

- [ ] **Copy both live `PLN_` codes somewhere safe for §4.** `[VERIFY IN DASHBOARD]`
      **Verify:** you have two distinct strings starting `PLN_`, and you can say which is
      monthly and which is annual. Swapping them charges annual buyers ₵40/yr — a revenue
      bug that reconciles cleanly in the DB and would be easy to miss.

- [ ] **Copy the live secret key `sk_live_…`.** `[VERIFY IN DASHBOARD]`
      Settings → API Keys & Webhooks, in **Live** mode.
      **Verify:** it starts `sk_live_`. Treat it like a password — it is simultaneously the
      API credential **and** the webhook HMAC key.

- [ ] **Do NOT go looking for a public key.**
      `pk_live_` is not used by this codebase (see §0). There is no var to put it in.
      **Verify:** nothing. This box exists so you don't spend twenty minutes hunting for a
      variable that was never wired.

---

## 3. Register the LIVE webhook endpoint

Paystack keeps **separate** webhook URLs for test and live mode. Your test-mode webhook
registration does not carry over.

- [ ] **Register the live webhook URL.** `[VERIFY IN DASHBOARD]`
      Settings → API Keys & Webhooks → **Live** mode → Webhook URL:
      `https://moneybos.com/api/paystack/webhook`
      **Verify:** saved and shown in the Live tab. Use the production custom domain, not the
      `.vercel.app` host — the vercel.app URL works but pins the webhook to a Vercel-owned
      hostname you may later change.

- [ ] **Confirm there is no separate signing secret to copy.**
      Paystack signs with your secret key. If the dashboard shows no webhook-secret field,
      that is correct and expected.
      **Verify:** re-read `api/paystack/webhook.js:9-12`. The key used for verification is
      `process.env.PAYSTACK_SECRET_KEY` (line 147). Nothing else.

- [ ] **Confirm the events we handle are enabled** (if the dashboard offers event selection). `[VERIFY IN DASHBOARD]`
      The `HANDLED` set (`webhook.js:33-39`) is exactly:
      `charge.success`, `subscription.create`, `subscription.not_renew`,
      `subscription.disable`, `invoice.payment_failed`.
      **Verify:** all five are enabled. `subscription.not_renew` is the one that matters most
      and is easiest to overlook — it is what a hosted-manage-page cancel actually emits.
      Anything else that arrives is acknowledged with 200 and ignored, which is safe.

---

## 4. Vercel env swap — PRODUCTION environment ONLY

**The core safety property: Preview and Development keep `sk_test_…` and the test `PLN_`
codes, so a preview deploy can never charge a real card.**

> **⚠️ Vercel trap — read before editing.** If a var is currently set for *All
> Environments*, editing its value changes it everywhere, including Preview. And if you
> instead *narrow* it to Production only without adding explicit Preview/Development
> values, previews get **no value at all** — `checkout.js:105` then returns
> `server_misconfigured` (500) and you will misread that as a broken deploy. So for each
> var: set the Production value **and** confirm a separate Preview/Development value exists.

- [ ] **`PAYSTACK_SECRET_KEY`** → Production = `sk_live_…`
      **Verify:** Production shows `sk_live_`; Preview and Development still show `sk_test_`.

- [ ] **`PAYSTACK_PLAN_CODE_MONTHLY`** → Production = live monthly `PLN_…`
      **Verify:** Production value matches the live Monthly plan from §2; Preview/Development
      still hold the test-mode code.

- [ ] **`PAYSTACK_PLAN_CODE_ANNUAL`** → Production = live annual `PLN_…`
      **Verify:** Production value matches the live Annual plan; Preview/Development still
      hold the test-mode code.

- [ ] **`SUPABASE_SERVICE_ROLE_KEY`** — **do not change.**
      **Verify:** present and unchanged in Production. If it were missing, checkout and
      manage-link return `server_misconfigured` and the webhook would fail to write.

- [ ] **`SUPABASE_URL`** (or the `VITE_SUPABASE_URL` fallback) — **do not change.**
      **Verify:** present in Production. Note there is **one shared Supabase project across
      dev/staging/main** — so a live-mode webhook writes to the same `subscriptions` table
      your test-mode subscriptions live in. That is by design; it means your test rows and
      real rows coexist and you should be able to tell them apart (see §8).

- [ ] **`GH_CHECKS_TOKEN`** — confirm present.
      **Verify:** set in Vercel. If missing, `vercel-ignore-build.mjs` fails closed and your
      production redeploy in §5 will be **skipped**, leaving the old test keys live while
      you believe you shipped.

- [ ] **Final read-through of the whole Production env list.**
      **Verify:** exactly three Paystack vars, all Production-scoped, all live values. No
      `VITE_`-prefixed Paystack var exists anywhere — a `VITE_` prefix would bundle the
      secret key into the client bundle and publish it to every visitor.

---

## 5. Redeploy — env changes are not live until a fresh deploy

Vercel env vars are injected at build/deploy time. Editing them changes **nothing** on the
currently-running deployment.

- [ ] **Trigger a production deploy.**
      Either merge to `main` through the normal branch model (dev → staging → main), or use
      Vercel's **Redeploy** on the current production deployment.
      **Verify:** a new production deployment appears with a timestamp *after* your env edits.

- [ ] **Confirm the deploy was not skipped by the CI gate.**
      `vercel-ignore-build.mjs` exits 0 (skip) if CI is red, still running at the 5-minute
      timeout, or the token/SHA is missing — all fail-closed.
      **Verify:** deployment status is **Ready**, not "Skipped"/"Canceled". If skipped, check
      the build log for `[deploy-gate] FAIL-CLOSED` and fix the cause, then Redeploy.

- [ ] **Confirm the running deployment actually holds the live key.**
      **Verify:** on production, start a checkout (do not pay yet) and confirm the Paystack
      hosted page loads **without** the test-mode banner Paystack shows on test checkouts.
      That banner's absence is your proof the live key is in effect — the env value itself is
      not readable from the client by design.

- [ ] **Expect and ignore 401s from stale test webhooks.**
      Any test-mode event Paystack retries after the swap now fails HMAC verification and
      gets a 401 (`webhook.js:158-161`).
      **Verify:** if you see `[webhook] invalid signature` in Vercel logs shortly after the
      swap, correlate with a test-mode event before panicking. Persistent 401s on **live**
      events mean the secret key in Vercel does not match the one the live webhook is
      signing with — recheck §4.

---

## 6. Real-card verification — two real transactions, both refunded

Do this yourself, on a real card, on production. Test mode cannot prove this path; the
whole point of the runbook is the last mile it could not cover.

**Two passes, both required: monthly (₵40) first in 6.1–6.9, then annual (₵400) in 6.10.**
Monthly leads because it is the cheaper way to prove the whole chain works; annual follows
because it is the only way to prove the annual plan code is not the monthly one. Both are
refunded and their rows soft-deleted before you finish.

- [ ] **6.1 Start checkout.** Sign in as yourself on `https://moneybos.com`, go to `/pricing`,
      pick **Monthly**, click Upgrade.
      **Verify:** you land on Paystack's hosted page, **no test-mode banner**, amount reads
      **₵40**, currency GHS.

- [ ] **6.2 Pay with a real card.**
      **Verify:** Paystack shows success and redirects you back to
      `https://moneybos.com/pricing?checkout=return` — the callback derived by
      `resolveCallbackUrl()` from the allow-listed `x-forwarded-host`. If you land on a
      *different* host, the forwarded host was not allow-listed and fell back to
      `moneybos.com`; if you land somewhere unexpected entirely, stop and investigate before
      any further charges.

- [ ] **6.3 Confirm the charge in Paystack.** `[VERIFY IN DASHBOARD]`
      **Verify:** Live → Transactions shows one successful ₵40 charge with your email, and
      Live → Subscriptions shows a new active subscription against the live monthly plan.

- [ ] **6.4 Confirm the webhook fired and was accepted.**
      **Verify (two places, both):**
      - Paystack dashboard webhook log: `charge.success` (and `subscription.create`) delivered
        with a **200** response. `[VERIFY IN DASHBOARD]`
      - Vercel function logs for `/api/paystack/webhook`: no `invalid signature`, no
        `apply_subscription_event error`. A validly-signed event that failed to persist
        still returns 200 by design (`webhook.js` response contract) — **so a 200 in
        Paystack alone does not prove the DB write succeeded.** You must check the Vercel log
        too, and §6.5.

- [ ] **6.5 Confirm the subscription row landed.**
      In the Supabase SQL editor:
      ```sql
      SELECT user_id, tier, status, paystack_status, plan_interval,
             paystack_subscription_id, paystack_plan_code,
             current_period_start, current_period_end, cancel_at_period_end
      FROM subscriptions
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 5;
      ```
      **Verify:** newest row is yours, with `tier='pro'`, `status='active'`,
      `plan_interval='monthly'`, a `SUB_…` in `paystack_subscription_id`, and
      `paystack_plan_code` equal to your **live** monthly `PLN_` code. If the plan code is
      the test one, §4 did not take effect.

- [ ] **6.6 Confirm the app grants Pro.**
      Reload the app.
      **Verify:** `/pricing` shows "Your plan" on Pro; Pro capabilities are live — you can
      exceed the Free caps (>10 categories, >2 members, >1 hub), full history is visible,
      premium skins unlock.

- [ ] **6.7 Verify CANCEL — the flow shipped 2026-09-02.**
      On `/pricing`, click **Manage subscription** (`ManageSubscriptionButton` →
      `billing.service.getManageLink()` → `POST /api/paystack/manage-link`).
      **Verify, in order:**
      - You are redirected to a Paystack-hosted manage page for **your** subscription.
      - Cancel there. Paystack emits `subscription.not_renew` (this is why it is in `HANDLED`).
      - The webhook log shows that event delivered with 200. `[VERIFY IN DASHBOARD]`
      - Re-run the SQL in 6.5: the row should show `cancel_at_period_end = true` and
        **`status` still granting access until `current_period_end`** — the mid-period
        fairness fix. **If you lose Pro instantly, that is the pre-fix behaviour and it is a
        bug — stop and investigate.**
      - The app still shows Pro. You paid for the period; you keep it.

- [ ] **6.8 Refund yourself.** `[VERIFY IN DASHBOARD]`
      Paystack Live → Transactions → your ₵40 charge → Refund.
      **Verify:** transaction shows refunded/reversed. Note the refund lands back on the card
      on Paystack's/the bank's own timeline, not instantly.

- [ ] **6.9 Soft-delete the live-test subscription row. Not a decision — do it.**
      The refund is a Paystack-side money event; it emits nothing `apply_subscription_event`
      acts on, so the row still reads `tier='pro'`, `status='active'` and keeps reading that
      way until `current_period_end`. Left standing it is test debris in the real subscription
      count: it inflates every reconciliation in §8, and a future you reading that row cannot
      tell a live-test artefact from a real paying customer.
      Soft-delete it — `deleted_at = now()`, **never** a hard delete (§11: soft deletes
      everywhere). `deleted_at IS NULL` is already the filter every reader applies
      (`getCurrentSubscription()`, `manage-link.js`, the §8 queries), so one UPDATE removes it
      from the app's view and from the counts at once.
      ```sql
      -- (a) Read first. Confirm exactly which row(s) you are about to retire.
      SELECT id, plan_interval, tier, status, paystack_subscription_id,
             paystack_plan_code, current_period_end, created_at
      FROM subscriptions
      WHERE deleted_at IS NULL AND user_id = '<your-user-id>'
      ORDER BY created_at DESC;

      -- (b) Then retire it BY id — never by user_id alone, never without the guard.
      UPDATE subscriptions SET deleted_at = now(), updated_at = now()
      WHERE id = '<the id you just read>' AND deleted_at IS NULL;
      ```
      **Verify:** the UPDATE reports exactly the row count you intended (one per live test);
      re-running the §6.5 SELECT no longer returns it; and the app shows you back on **Free**
      — which is the correct end state, because you refunded the charge in §6.8.
      Do this for the annual row from §6.10 as well. Note the ids in `docs/backlog.md` with
      the date, so the retirement is itself auditable.

- [ ] **6.10 MANDATORY — repeat 6.1–6.5 for ANNUAL, then refund (§6.8) and soft-delete (§6.9).**
      Not optional. This is the **only** proof that `PAYSTACK_PLAN_CODE_ANNUAL` holds the
      annual code and not the monthly one, and nothing else in this runbook can catch that
      swap. `checkout.js:113` sends `amount: PRICING[interval].amount` alongside `plan`, so the
      **first** charge reads ₵400 whichever plan code is attached — the swap is invisible at
      purchase. It surfaces only at renewal, on a real customer's card: an annual buyer's
      subscription renews against the monthly plan (₵40, monthly), and a monthly buyer's
      against the annual plan (₵400, yearly). Both are revenue bugs that reconcile cleanly in
      the DB and read as correct until the money moves.
      The ₵400 is floated only between 6.2 and the refund in 6.8 — minutes, to yourself. A
      swapped plan code discovered by a paying customer costs immeasurably more.
      **Verify:**
      - The Paystack hosted page reads **₵400**, currency GHS, no test-mode banner.
      - The §6.5 SELECT returns `plan_interval='annual'` **and** `paystack_plan_code` equal to
        the live **annual** `PLN_` code from §2 — not the monthly one. Compare the full
        strings; they differ only in the random suffix, so read it character by character
        rather than eyeballing the prefix.
      - Refund (§6.8) and soft-delete the row (§6.9), exactly as for the monthly test.
      **If you genuinely cannot run this** (e.g. the card cannot float ₵400), the annual plan
      is unverified in live mode — then you must **remove the Annual option from
      `BillingToggle` and ship that** before go-live, rather than sell an unproven plan.
      Recording "annual unverified" and selling it anyway is not one of the options.

---

## 7. Rollback — reverting to test keys

Do this if anything in §6 fails in a way you cannot explain, or if a real customer is
charged incorrectly.

- [ ] **7.1 Revert the three Production env vars to their test values.**
      `PAYSTACK_SECRET_KEY` → `sk_test_…`; `PAYSTACK_PLAN_CODE_MONTHLY` /
      `PAYSTACK_PLAN_CODE_ANNUAL` → the test `PLN_` codes.
      **Verify:** Production shows `sk_test_`. Keep the test values recorded somewhere
      retrievable **before** you start §4 — mid-incident is a bad time to go looking.

- [ ] **7.2 Redeploy.** Env reverts, like the swap, need a fresh deploy.
      **Verify:** new deployment is Ready and a checkout on production now shows Paystack's
      test-mode banner again.

- [ ] **7.3 Leave the live webhook registered.** Harmless — live events will simply fail
      signature verification (401) once the secret is back to test.
      **Verify:** nothing to do. Do not delete the live webhook; you will need it again.

- [ ] **7.4 Reconcile any real charges taken before the rollback.** `[VERIFY IN DASHBOARD]`
      **Verify:** every live transaction in the window is either refunded or corresponds to a
      correct `subscriptions` row. Real money that took a wrong path is the one thing this
      runbook exists to prevent — resolve it the same day.

- [ ] **7.5 Write down what happened before you re-attempt.**
      **Verify:** a dated entry in `docs/backlog.md`. Re-running the swap without knowing why
      it failed is how you fail twice.

---

## 8. Post-live — what to monitor

**First 24 hours — check each of these at least once:**

- [ ] **Vercel function logs for `/api/paystack/webhook`.** Watch for `invalid signature`
      (key mismatch), `apply_subscription_event error` (a validly-signed event that failed to
      persist — silent, because the handler still returns 200), and `rpc threw`.
- [ ] **Vercel function logs for `/api/paystack/checkout`.** `missing PAYSTACK_SECRET_KEY` or
      `missing supabase env` means a var did not land. `paystack init failed` means Paystack
      rejected our request — most likely a bad plan code.
- [ ] **Vercel function logs for `/api/paystack/manage-link`.** `lookup_failed` (500) is a DB
      problem; `no_subscription` (404) is expected for users with no subscription row.
- [ ] **Paystack webhook delivery log — any non-200s.** `[VERIFY IN DASHBOARD]`

**First week:**

- [ ] **Every live transaction has a matching `subscriptions` row.** The reconciliation query:
      ```sql
      SELECT user_id, tier, status, paystack_status, plan_interval,
             paystack_plan_code, current_period_end, cancel_at_period_end, created_at
      FROM subscriptions
      WHERE deleted_at IS NULL AND created_at > now() - interval '7 days'
      ORDER BY created_at DESC;
      ```
      Compare the count against Paystack Live → Transactions. A charge with no row is a
      customer who paid and got nothing — the highest-severity failure mode in this system.
- [ ] **Watch for `invoice.payment_failed` → `past_due`.** Confirm those users can still reach
      the manage link (by design, any non-deleted row with a `paystack_subscription_id`
      qualifies — a `past_due` customer needs that page most).
- [ ] **First renewal.** The monthly plan renews ~30 days after go-live. That is the first
      time the *plan* (not the initial transaction) drives a charge — the first real proof the
      plan amount in §2 was right. Diarise it.
- [ ] **First real cancellation.** Confirm `not_renew` → access held to `current_period_end`,
      then expiry. The mid-period fairness path is only fully proven once a real one completes.

**Ongoing:**

- [ ] **Never let Preview drift to live keys.** Any new Vercel env var, any "apply to all
      environments" click, can undo the §4 separation.
- [ ] **Re-check both halves when re-confirming mode.** The Vercel env value **and** the
      Paystack dashboard toggle. They can disagree, and each serverless route inherits
      whichever key its own environment holds.

---

## 9. Known non-blockers (recorded so they aren't re-discovered mid-swap)

- **`src/lib/pricing.js` has `paystack_plan_code: null` on both plans.** Dead fields —
  `checkout.js` resolves plan codes from env via `resolvePlanCode()` and never reads these.
  Leave them or delete them; they do not affect go-live.
- **`api/paystack/checkout.js:20` says "Ships DARK: no UI calls this yet."** Stale — `PricingView`
  is mounted and reachable. A comment only; worth fixing when you next touch the file.
- **The callback host allowlist** (`checkout.js:34-38`) is `moneybos.com`,
  `www.moneybos.com`, `family-finance-plum.vercel.app`. A **preview** deploy's random
  `*.vercel.app` host is not on it, so a checkout started from a preview returns the user to
  **production** `moneybos.com/pricing?checkout=return`. Harmless with test keys (the charge
  is a no-op), but it means preview checkout returns look confusing. Not a go-live blocker;
  do not "fix" it by widening the allowlist — it is an open-redirect guard on a payment path.
- **`auth.service.js` reset-redirect allowlist** is a separate, unrelated list
  (`https://moneybos.com`, `http://localhost:5173`). Nothing to change at go-live.

---

## 10. Ordering summary

```
1  Pre-flight decisions        counsel · DRAFT banner · **terms §6.6 (BLOCKER)** · /pricing gate · D3
2  Paystack LIVE plans          two PLN_ codes + sk_live_    [dashboard, Live mode]
3  LIVE webhook                 URL + 5 events               [dashboard, Live mode]
4  Vercel env swap              3 vars, PRODUCTION only; Preview stays on test
5  Redeploy                     env is inert until deployed; confirm not CI-skipped
6  Real-card verification       monthly AND annual: charge → webhook → row → Pro → cancel
                                → refund → soft-delete the test row
7  Rollback                     if anything above is unexplained
8  Post-live monitoring         24h · 1wk · first renewal · first real cancel
```

**The single most dangerous step is §4→§5.** Env edits without a redeploy look successful and
change nothing; a redeploy silently skipped by the CI gate looks like a deploy and changes
nothing. Verify §5 explicitly before you put a real card into §6.
`````

---

# 2. Every place Paystack keys / URLs / secrets are read

`grep -rn "PAYSTACK\|paystack" src/ supabase/ scripts/ api/ --include=*.js --include=*.jsx --include=*.sql --include=*.ts -l`

**Note: there is no `supabase/` directory** — the grep exits 2 on it. No Supabase Edge
Functions exist in this repo.

```
src/services/billing.service.js          src/services/billing.service.test.js
src/services/checkout.service.js         src/services/checkout.service.test.js
src/lib/pricing.js                       src/views/PricingView.test.jsx
scripts/f3_erasure_runbook.sql           scripts/apply_subscription_event_dryrun.sql
scripts/migrate_19_subscriptions.sql     scripts/apply_subscription_event.sql
api/paystack/checkout.js                 api/paystack/checkout.test.js
api/paystack/webhook.js                  api/paystack/webhook.test.js
api/paystack/manage-link.js              api/paystack/manage-link.test.js
```

## The actual secret / key / URL reads (non-test source)

```
api/paystack/checkout.js:104:    const secret = process.env.PAYSTACK_SECRET_KEY;
api/paystack/checkout.js:106:      console.error('[checkout] missing PAYSTACK_SECRET_KEY');
api/paystack/checkout.js:43:      monthly: 'PAYSTACK_PLAN_CODE_MONTHLY',
api/paystack/checkout.js:44:      annual:  'PAYSTACK_PLAN_CODE_ANNUAL',
api/paystack/checkout.js:26:    const PAYSTACK_INIT_URL = 'https://api.paystack.co/transaction/initialize';

api/paystack/webhook.js:147:    const secret = process.env.PAYSTACK_SECRET_KEY;
api/paystack/webhook.js:158:    if (!verifySignature(raw, req.headers['x-paystack-signature'], secret)) {
api/paystack/webhook.js:175:    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
api/paystack/webhook.js:176:    createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, …)

api/paystack/manage-link.js:56:  const secret      = process.env.PAYSTACK_SECRET_KEY;
api/paystack/manage-link.js:33:  const PAYSTACK_API = 'https://api.paystack.co';
api/paystack/manage-link.js:43:  return `${PAYSTACK_API}/subscription/${encodeURIComponent(subscriptionCode)}/manage/link`;

src/services/checkout.service.js:16:  const CHECKOUT_ENDPOINT    = '/api/paystack/checkout';
src/services/billing.service.js:18:   const MANAGE_LINK_ENDPOINT = '/api/paystack/manage-link';
```

`src/lib/pricing.js:23,31` hold `paystack_plan_code: null` — dead fields, never read
(runbook §9 confirms).

## Literal-key audit

Across the whole repo (excluding `node_modules`), matching `sk_(test|live)_…`,
`pk_(test|live)_…`, `PLN_…`:

```
api/paystack/manage-link.test.js:60    process.env.PAYSTACK_SECRET_KEY = 'sk_test_[REDACTED]';
api/paystack/manage-link.test.js:158   expect(opts.headers.Authorization).toBe('Bearer sk_test_[REDACTED]');
api/paystack/webhook.test.js:20        const SECRET = 'sk_test_[REDACTED]';
api/paystack/checkout.test.js:46       process.env.PAYSTACK_SECRET_KEY = 'sk_test_[REDACTED]';
api/paystack/checkout.test.js:168      expect(opts.headers.Authorization).toBe('Bearer sk_test_[REDACTED]');
docs/backlog.md:861                    both key forms; the test hardcodes `sk_test_[REDACTED]`.
```

All six are **fabricated fixtures inside test files**, not credentials. **No real key,
and no `PLN_` plan code, is committed anywhere.** No `pk_*` anywhere at all.

---

# 3. Env var names (names only)

## `.env.example` — actually set locally

| Name | Scope |
|---|---|
| `VITE_SUPABASE_URL` | client bundle, all environments |
| `VITE_SUPABASE_ANON_KEY` | client bundle, all environments |

The file also **documents, in comments only**, five server-only vars it deliberately does
not define: `PAYSTACK_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`,
`PAYSTACK_PLAN_CODE_MONTHLY`, `PAYSTACK_PLAN_CODE_ANNUAL`.

## Config files in the repo

`vercel.json` declares **no env vars** — only rewrites, asset cache headers, and
`ignoreCommand`. `.vercelignore` exists; there is no `supabase/config.toml`, no
`.env.production`, no Vercel env manifest. **All env values live in the Vercel dashboard
and cannot be read from this repo.**

`scripts/vercel-ignore-build.mjs` reads three more: `VERCEL_GIT_COMMIT_REF`,
`VERCEL_GIT_COMMIT_SHA` (both Vercel-injected), and `GH_CHECKS_TOKEN` (manually set).

`vite.config.js` additionally reads `VERCEL_GIT_COMMIT_SHA` at build time for the build
stamp (added 2026-09-20) — not a Paystack concern, listed for completeness.

## Production vs Preview scoping

| Name | Intended scope | Differs test vs live? |
|---|---|---|
| `PAYSTACK_SECRET_KEY` | Production = live; Preview/Dev = test | **Yes** |
| `PAYSTACK_PLAN_CODE_MONTHLY` | Production = live; Preview/Dev = test | **Yes** |
| `PAYSTACK_PLAN_CODE_ANNUAL` | Production = live; Preview/Dev = test | **Yes** |
| `SUPABASE_SERVICE_ROLE_KEY` | all environments, same value | No |
| `SUPABASE_URL` | all environments, same value | No |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | all environments, same value | No |
| `GH_CHECKS_TOKEN` | Production (only `main` is gated) | n/a |

**This is intent, not observed state.** Nothing in the repo records which Vercel scope
each var currently carries — §4 of the runbook exists precisely because that has to be
confirmed by eye in the dashboard.

---

# 4. The webhook

**A Vercel serverless function** (Node runtime) at `api/paystack/webhook.js` → public URL
`https://moneybos.com/api/paystack/webhook`. Not a Supabase Edge Function; there is no
`supabase/` directory.

**Signature verification:** HMAC-SHA512 over the **raw request bytes**, keyed by
`PAYSTACK_SECRET_KEY` (no separate webhook secret), compared with
`crypto.timingSafeEqual` against `x-paystack-signature`. Length is checked first because
`timingSafeEqual` throws on unequal lengths. Verification happens **before** any JSON
parse or DB touch.

**On `charge.success`:** `mapEvent` normalises it — `periodStart = data.paid_at`,
`periodEnd = computeEnd(paid_at, interval)` (+1 month or +1 year), `user_id` from the
metadata stamped at checkout, plus subscription/customer/plan codes — then calls
`apply_subscription_event` via a service-role client. The SQL sets `tier='pro'`,
`status='active'`, `cancel_at_period_end=false`.

Full handler, verbatim:

```js
/**
 * api/paystack/webhook.js — Vercel serverless function (Node runtime).
 *
 * The ONLY writer of the subscriptions table. Paystack POSTs subscription lifecycle
 * events here; we verify the signature, normalize the payload, and hand it to the
 * apply_subscription_event RPC (service_role). The handler stays thin on purpose —
 * all the upsert/idempotency logic lives in SQL (CLAUDE.md §9.6).
 *
 * SIGNATURE: Paystack signs the RAW request body with HMAC-SHA512 keyed by your
 * PAYSTACK_SECRET_KEY (there is NO separate webhook secret). We compute over the exact
 * received bytes and timing-safe compare. An invalid signature is rejected BEFORE any
 * DB touch — this is the only thing standing between a public URL and forged upgrades.
 *
 * RESPONSE CONTRACT:
 *   - invalid signature        → 401 (a rejected request, not an internal error)
 *   - valid sig, our error      → 200 (ack receipt; don't make Paystack retry an event we
 *                                  own but failed to persist — the failure is logged)
 *   - valid sig, unknown event  → 200 ignored
 *
 * Env (server-only): PAYSTACK_SECRET_KEY, SUPABASE_URL (or VITE_SUPABASE_URL),
 * SUPABASE_SERVICE_ROLE_KEY.
 */

import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// The only events we act on. Everything else is acknowledged and ignored.
//
// not_renew vs disable: Paystack emits `subscription.not_renew` when a subscription
// is set to stop renewing (what the hosted manage page's cancel does) and
// `subscription.disable` when it is actually disabled. We forward BOTH and let
// apply_subscription_event decide, so the outcome is correct whichever one arrives
// — see that file's EVENT -> STATE MAP.
const HANDLED = new Set([
  'charge.success',
  'subscription.create',
  'subscription.not_renew',
  'subscription.disable',
  'invoice.payment_failed',
]);

/**
 * Timing-safe HMAC-SHA512 check of the raw body against the x-paystack-signature header.
 * @param {Buffer|string} rawBody  exact received bytes
 * @param {string} signature        x-paystack-signature header value
 * @param {string} secret           PAYSTACK_SECRET_KEY
 * @returns {boolean}
 */
export function verifySignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  if (a.length !== b.length) return false;   // timingSafeEqual requires equal lengths
  return crypto.timingSafeEqual(a, b);
}

/** Map Paystack's interval vocabulary onto our canonical 'monthly' | 'annual'. */
function canonInterval(v) {
  if (!v) return null;
  const s = String(v).toLowerCase();
  if (s === 'monthly' || s === 'month') return 'monthly';
  if (s === 'annual' || s === 'annually' || s === 'yearly' || s === 'year') return 'annual';
  return null;
}

/** start ISO + interval → period-end ISO (provisional; subscription.* events override). */
function computeEnd(startIso, interval) {
  if (!startIso || !interval) return null;
  const d = new Date(startIso);
  if (Number.isNaN(d.getTime())) return null;
  if (interval === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (interval === 'annual') d.setFullYear(d.getFullYear() + 1);
  else return null;
  return d.toISOString();
}

/**
 * Normalize a Paystack event into apply_subscription_event RPC args.
 * Returns null for events we don't handle.
 * @param {object} event  parsed Paystack webhook body
 * @returns {object|null} the RPC argument object (p_* keys), or null
 */
export function mapEvent(event) {
  const type = event?.event;
  if (!HANDLED.has(type)) return null;

  const d        = event?.data || {};
  const customer = d.customer || {};
  const plan     = d.plan || d.subscription?.plan || {};
  const metadata = d.metadata || {};

  // metadata.plan_interval (we stamp it at checkout, already canonical) is preferred;
  // Paystack's own plan.interval ('annually' etc.) is the fallback.
  const interval = canonInterval(metadata.plan_interval) || canonInterval(plan.interval);

  const subCode = d.subscription_code || d.subscription?.subscription_code || null;

  // Period end: subscription.* events (create / not_renew / disable) carry
  // next_payment_date (authoritative); a charge.success carries paid_at, from which
  // we derive a provisional end. On a cancellation this is the date the customer
  // has already paid through — which is exactly what keeps them Pro until then.
  let periodStart = null;
  let periodEnd   = null;
  if (type === 'charge.success') {
    periodStart = d.paid_at || d.paidAt || null;
    periodEnd   = computeEnd(periodStart, interval);
  } else {
    periodEnd = d.next_payment_date || d.subscription?.next_payment_date || null;
  }

  return {
    p_event_type:      type,
    p_user_id:         metadata.user_id || null,
    p_email:           customer.email || null,
    p_subscription_id: subCode,
    p_customer_id:     customer.customer_code || null,
    p_plan_code:       plan.plan_code || null,
    p_paystack_status: d.status || d.subscription?.status || null,
    p_plan_interval:   interval,
    p_period_start:    periodStart,
    p_period_end:      periodEnd,
  };
}

/**
 * Read the raw request bytes. Vercel's Node body parsing is lazy, so reading the stream
 * BEFORE touching req.body gives us the exact bytes Paystack signed. If the stream was
 * already drained (a runtime pre-parsed it), fall back to the parsed body.
 */
async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length) return Buffer.concat(chunks);

  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body, 'utf8');
  if (req.body && typeof req.body === 'object') return Buffer.from(JSON.stringify(req.body), 'utf8');
  return Buffer.alloc(0);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const secret = process.env.PAYSTACK_SECRET_KEY;

  let raw;
  try {
    raw = await getRawBody(req);
  } catch (e) {
    console.error('[webhook] raw body read failed:', e.message);
    return res.status(200).json({ received: true });
  }

  // Verify BEFORE any parse or DB touch.
  if (!verifySignature(raw, req.headers['x-paystack-signature'], secret)) {
    console.error('[webhook] invalid signature');
    return res.status(401).json({ error: 'invalid_signature' });
  }

  let event;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch (e) {
    console.error('[webhook] malformed json:', e.message);
    return res.status(200).json({ received: true });
  }

  const rpcArgs = mapEvent(event);
  if (!rpcArgs) return res.status(200).json({ received: true, ignored: event?.event || null });

  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const { error } = await supabase.rpc('apply_subscription_event', rpcArgs);
    if (error) console.error('[webhook] apply_subscription_event error:', error.message);
  } catch (e) {
    console.error('[webhook] rpc threw:', e.message);
  }

  // Always ack a validly-signed event so Paystack stops retrying. Failures are logged.
  return res.status(200).json({ received: true });
}
```

---

# 5. What decides test vs live at runtime

**Nothing. There is no discriminator anywhere in the code.**

A grep for
`sk_test|sk_live|pk_test|pk_live|startsWith('sk_|test_mode|testmode|is_live|sandbox|NODE_ENV|VERCEL_ENV|import.meta.env.(DEV|PROD|MODE)`
across `src/`, `api/` and `scripts/*.mjs`, excluding tests, returns **exactly two hits —
both JSDoc comments**:

```
api/paystack/checkout.js:14:    *   PAYSTACK_SECRET_KEY   Paystack API auth (sk_test_… / sk_live_…)
api/paystack/manage-link.js:23: *   PAYSTACK_SECRET_KEY   Paystack API auth (sk_test_… / sk_live_…)
```

The mode is **entirely implicit in the value of `PAYSTACK_SECRET_KEY` in whichever Vercel
environment the function is running in**. Paystack itself decides: the key you
authenticate with determines which mode the API call and the HMAC belong to. The app
never asks which mode it is in, never branches on it, never logs it, and cannot display
it.

Two consequences worth being explicit about:

- There is **no guard** that would stop a live key landing in Preview, or a test key
  surviving in Production. The runbook's Preview/Production separation is a dashboard
  convention with no code enforcement behind it.
- After the swap, the only in-app evidence of which mode you are in is **the absence of
  Paystack's test-mode banner on their hosted page** (runbook §5). Nothing in your own UI
  or logs says "live".

---

# 6. The `subscriptions` table

Created by `scripts/migrate_19_subscriptions.sql`:

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `user_id` | `uuid` NOT NULL | FK `auth.users(id)` ON DELETE CASCADE |
| `tier` | `text` NOT NULL | CHECK `IN ('free','pro')` |
| `status` | `text` NOT NULL | CHECK `IN ('active','canceled','past_due','incomplete')` |
| `paystack_status` | `text` | raw Paystack string, debug/audit only |
| `paystack_subscription_id` | `text` | `SUB_…` |
| `paystack_customer_id` | `text` | `CUS_…` |
| `paystack_plan_code` | `text` | `PLN_…` |
| `plan_interval` | `text` | CHECK `NULL OR IN ('monthly','annual')` |
| `current_period_start` | `timestamptz` | |
| `current_period_end` | `timestamptz` | |
| `cancel_at_period_end` | `boolean` NOT NULL | default `false` |
| `created_at` / `updated_at` | `timestamptz` NOT NULL | default `now()` |
| `deleted_at` | `timestamptz` | soft delete |

Indexes:

- `idx_subscriptions_user_id` — partial, `WHERE deleted_at IS NULL`
- `idx_subscriptions_user_active` — **unique**, `WHERE deleted_at IS NULL AND status='active'`
  (at most one active row per user)
- `idx_subscriptions_paystack_sub_id` — **unique**, `WHERE paystack_subscription_id IS NOT NULL`

RLS: own-row SELECT only (`subscriptions_select_own`). **No INSERT/UPDATE/DELETE policy at
all** — revenue state is never client-writable. The webhook writes as service_role, which
bypasses RLS.

## What flips `is_pro`

**There is no `is_pro` column.** It is derived, twice, from the same predicate:

- Client — `resolveSubscription(row)` in `src/services/subscriptions.service.js:86`:

  ```js
  const periodOpen = !row.current_period_end || new Date(row.current_period_end) > now;
  const isActive   = row.status === 'active' && periodOpen;
  const tier       = isActive ? (row.tier || 'free') : 'free';
  const isPro      = tier === 'pro';
  ```

  `useSubscription.jsx:61` memoises it; `useIsPro()` reads it from context.

- Server — `hub_tier()`, `create_hub`, `create_invite`, `create_category`,
  `create_categories_bulk`, `update_centre_skin` and `accept_invite` all apply
  `status='active' AND (current_period_end IS NULL OR current_period_end > now())`.

So **`status` and `current_period_end` jointly flip Pro**. `tier='free'` is never written —
downgrade is implicit expiry. `cancel_at_period_end` is display/audit only and gates
nothing.

## What writes `period_end`

Only `apply_subscription_event` (SECURITY DEFINER; `EXECUTE` revoked from `authenticated`
and `anon`, granted to `service_role` only — `apply_subscription_event.sql:229-231`).

Event → state map:

| Event | Effect |
|---|---|
| `charge.success` | `tier='pro'`, `status='active'`, `cancel=false` |
| `subscription.create` | `tier='pro'`, `status='active'`, `cancel=false` |
| `invoice.payment_failed` | `status='past_due'`; tier and cancel flag preserved |
| `subscription.not_renew` | `status` stays `'active'`, `cancel_at_period_end=true` |
| `subscription.disable` | period still open → `active` + cancel true; elapsed **or NULL** → `canceled` |

`period_end` only ever moves **forward** — `GREATEST(existing, incoming)` — so out-of-order
webhook delivery can never shorten a paid period. On insert, only an activating intent
creates a row (`skipped_no_row` otherwise), so a `canceled`/`past_due` phantom is never
materialised.

---

# 7. Test-mode-only code paths

**None.** Searching `src/` and `api/` for `test card`, `4084`, `408408`, `sandbox`,
`dummy`, `stub`, `fake`, `mock` — excluding test files and `test-utils/` — returns only
unrelated prose:

```
src/hooks/useModalChrome.js:9,26,65,87,141   "dummy history entry" (back-button intercept)
src/hooks/useFinance.js:16                   "Never imports from mockData"
src/lib/finance.js:3                         "No mock data."
src/views/daily/IncomeSourcePicker.jsx:13    "forcing it into a fake one"
src/components/layout/SidePanel.jsx:34       "the drawer's dummy sits below it"
```

No test card numbers, no `sandbox` strings, no hard-coded test plan codes, no
mode-conditional UI. The only test-mode artefacts are the six fabricated `sk_test_…`
strings inside the three `api/paystack/*.test.js` files (§2).

Two stale-comment findings, neither functional:

- `api/paystack/checkout.js:20` — *"Ships DARK: no UI calls this yet (Commit 2 wires the
  pricing page)."* Wrong; `PricingView` is mounted and reachable. Runbook §9 already
  records it.
- `src/lib/pricing.js:23,31` — `paystack_plan_code: null` on both plans. Dead fields;
  `resolvePlanCode()` reads env. Also recorded in §9.

---

# Summary — what a live switch would actually change

Three Vercel Production environment variables, and nothing else in this repository.
`PAYSTACK_SECRET_KEY` goes `sk_test_…` → `sk_live_…` and the two `PAYSTACK_PLAN_CODE_*`
vars get the live `PLN_` codes created fresh in the Paystack dashboard's Live mode; a
production redeploy then picks them up, because Vercel injects env at build time and
editing a value changes nothing on the running deployment. No source file changes, no
client rebuild is *required* by the key swap itself (no Paystack JS or public key is ever
bundled — the card is collected entirely on Paystack's hosted page), and no code path
anywhere asks which mode it is in: mode is implicit in the key value, which also doubles
as the webhook HMAC secret, so swapping it flips API auth and signature verification in
the same instant and any in-flight test-mode webhook retry starts returning 401. The
database is unaffected — one shared Supabase project, one `subscriptions` table, live rows
landing beside the test rows already in it, which is why the runbook insists the real-card
verification rows are refunded *and* soft-deleted. The genuinely dangerous properties are
all outside the code: nothing enforces that Preview keeps the test key, nothing validates
that the annual env var holds the annual plan code (the first charge reads ₵400 either way
— the swap only surfaces at renewal, on a customer's card), and a missing
`GH_CHECKS_TOKEN` makes the gate fail closed so the redeploy is silently skipped while
looking successful. Before any of that, the runbook's own §1 carries one hard blocker —
`terms.md` §6.6 still states in-account cancellation "is not yet available" when that flow
shipped 2026-09-02, and because the legal docs are `?raw`-bundled, fixing the file is inert
until a separate deploy lands ahead of the key swap.
