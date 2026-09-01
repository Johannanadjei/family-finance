# Backlog — Family Finance (non-cosmetic)

Engineering work deferred past MVP. Cosmetic items live in `cosmetic-backlog.md`.

---

## Observability: error capture (Sentry or self-hosted) — POST-MVP

**Why:** The data-loss-on-refresh bug (engineering-decisions.md [2026-05-29]) was
invisible because failed/empty fetches were silent — no telemetry surfaced them.
We added a `console.warn` canary (`lib/auth.js warnOnEmptyColdLoad`) as a stop-gap,
but it only shows in a developer's DevTools, never in production.

**What:** Wire a client error-capture service so production failures are visible:
- Capture service-layer errors (the `{ data, error }` error paths already log to
  `console.error` — forward those).
- Capture the `warnOnEmptyColdLoad` canary as a breadcrumb/event so residual
  RLS/auth races are observable in aggregate, not just per-device.
- Capture unhandled React errors via `ErrorBoundary`.

**Options:** Sentry (hosted, fastest) or a self-hosted alternative (GlitchTip/
self-hosted Sentry) if data-residency matters for financial data.

**Explicitly out of scope for the data-loss fix** — that shipped with the token
gate + truthful errors + retry banner. This is the visibility layer on top.

**Constraint:** adds a dependency — confirm against the "no new dependencies"
default before picking it up.

---

## Soft-deleted income tx debris (~125 rows) — POST-MVP cleanup

The database has ~125 soft-deleted income transactions with `income_source_id`
NULL, accumulated from live testing during May 2026 dev work. They don't affect
app behaviour (excluded by every query via the `deleted_at` filter), but they're
data debris.

**Investigation needed:**
- Are these all test data, or some real user transactions soft-deleted via the UI?
- Can they be hard-deleted, or should they stay for audit?
- Consider a one-time cleanup SQL:
  ```sql
  DELETE FROM transactions
  WHERE type = 'income'
    AND income_source_id IS NULL
    AND deleted_at IS NOT NULL
    AND deleted_at < '2026-06-01';
  ```

**Schedule:** post-MVP. Not urgent — pure cleanup.

---

## formatMonth → lib/dates.formatMonth — DONE (Commit 2.5)

RESOLVED: `formatMonth(ym)` was hoisted from the 6 view files into `lib/dates.js`
(alongside `getCurrentMonth`/`isPastMonth`) and the local duplicates removed. The
Budget Cycles service layer (Commit 3) depends on this shared export for cycle-name
generation, which is why the duplication was closed first.

Deferred (still open): the helper silently coerces bad input to "January 2001" — add
a defensive guard if i18n lands or production input is ever exposed; and the broader
`lib/finance` date-helper consolidation (Option γ) remains out of scope.

---

## Phase 2D — Settings categories all-months parity — POST-2C

Budget categories are month-scoped (like income sources), but Settings still shows
only the current month's categories (`SettingsView` → `CategorySettingsRow`), unlike
income which has the all-months segmented `IncomeSourcesSection`. Build a
`BudgetCategoriesSection` that mirrors `IncomeSourcesSection`: month-grouped,
collapsible sections, add-to-specific-month picker.

Pairs with the OQ1-B option (load all-months categories into `useBudgetCentre`,
derive a current-month slice) — only worth doing when this Settings view lands,
since BudgetView itself stays current-month-only.

**Schedule:** post-2C. Low priority — rollforward (2C) covers the new-month gap;
this is editing-parity polish.

---

## Hoist BrandLockup to a shared component (AuthScreen + JoinView duplication) — POST-MVP

`src/views/join/BrandLockup.jsx` duplicates AuthScreen's inline brand lockup
(`AuthScreen.jsx` — white icon + "Money B.O.S" wordmark + tagline) verbatim. The
duplication was deliberate: the join-branding commit kept the AuthScreen sign-in
path untouched to avoid launch-day regression risk.

**What:** Extract one shared lockup (likely `components/ui/BrandLockup.jsx`) and have
both AuthScreen and JoinView consume it in a single atomic commit. Regression-test
the sign-in path as part of that change.

**Schedule:** post-MVP code cleanup. Low priority — both copies render identically
today; this removes the duplication.

---

## iOS keyboard focus pushes modal under the keyboard — POST-MVP

On iOS Safari, focusing an `input`/`textarea` inside a bottom-sheet modal opens the
on-screen keyboard, which shifts the visual viewport up and can slide the
`position: fixed` modal partly under the keyboard (the focused field ends up
obscured). Distinct from the scroll-lock work (touchmove + overscroll-behavior,
commit branding the join flow's successor) — that prevents background scroll, not
keyboard-driven viewport shift.

**What:** Likely a `visualViewport` resize listener that re-anchors the sheet above
the keyboard, or `scrollIntoView` on focus. Needs real-device iteration.

**Schedule:** post-MVP. Not blocking — fields are reachable; the field can just be
briefly obscured on small screens.

---

## Versioned migrations: introduce `supabase/migrations/` — POST-MVP

**Why:** Schema changes live as ad-hoc `scripts/*.sql` files run manually in the
Supabase SQL editor (no ordering, no applied-state tracking, no rollback scripts).
The Budget Cycles project (Commit 1, `migrate_cycles_schema.sql`) added another. As
the cycles migration chain grows (Commits 1, 2, 9, …) the lack of versioning becomes
a liability — there's no record of what ran where.

**What:** Introduce a `supabase/migrations/` folder for versioned, ordered migrations
and consolidate the existing ad-hoc `scripts/` files into it (Option β, deferred at
Cycles Commit 1). Keep the manual-apply ergonomics or adopt the Supabase CLI.

**Schedule:** post-MVP / when the cycles migration chain stabilises.

---

## `view_only` role missing from PERMISSIONS map — POST-MVP

**Why:** The DB role CHECK constraint allows four roles
(`owner`, `full_access`, `standard`, `view_only`), but `src/lib/roles.js` PERMISSIONS
only defines three — `view_only` falls through to `can()`'s default-false. That's
*currently* harmless (and even desirable for `manageCycles`), but it means a
`view_only` member is denied every permission silently rather than by design.

**What:** Audit the role system and add an explicit `view_only` entry to PERMISSIONS
(and `ROLES`/`ROLE_LABELS`/`ROLE_DESCRIPTIONS`) when the role is actually wired up,
so its access is intentional rather than incidental.

**Schedule:** post-MVP / when `view_only` is surfaced in the UI.

---

## Freemium billing CTA escapes the settings gate — a standard member can pay for nothing — ✅ RESOLVED 2026-08-05, fully verified 2026-08-06 (display/CTA only — see "What this did NOT close")

> **RESOLVED — shipped to production 2026-08-05.** dev `30ce474` → staging `333e822` →
> main `dabd3e3`, 1700 tests / audit 299/0 green at each hop. Deploy confirmed live:
> `assets/App-Cp7hvsBh.js` on moneybos.com is byte-identical to the local build of main and
> carries the `hub_tier` / `p_centre_id` / ASK_OWNER_LINE markers. `hub_tier(uuid)` is live
> in the shared Supabase project.
>
> **Verification — COMPLETE 2026-08-06.** Walked with test accounts against production, the
> full role × tier matrix, all three cells green:
>
> | Hub tier | Viewer | Expected | Observed |
> |---|---|---|---|
> | Free | non-owner | cap message + `ASK_OWNER_LINE`, **no** pay button | ✅ |
> | Free | owner | working pay button → Paystack checkout | ✅ |
> | Pro | non-owner (`standard` AND `full_access`) | no caps at all, no false "10 of 10" | ✅ |
>
> Both halves of the fix are therefore confirmed in lived use, not just in tests: the CTA
> gate (row 1 vs row 2) and the `hubPlan` re-key that closed the inverse false-cap bug
> (row 3). No follow-up pass outstanding.
>
> **The fix, in order (order mattered):** `hub_tier(uuid)` — SECURITY DEFINER,
> membership-gated, returns only `'free'|'pro'` — resolves the hub's OWNER's tier, exposed
> client-side as `hubPlan` via `useHubTier` (owners take a fast path with no RPC).
> **Step 1** re-keyed every hub-scoped cap off `userPlan` onto `hubPlan`: category, member,
> skin, history, guests, and the `resolveSkin` clamp. That alone closed the **inverse**
> bug — a member of a PAID hub was being shown "10 of 10", truncated history and PRO skin
> badges while the server would have accepted the write. **Step 2** then gated the CTA: on
> a free hub the cap MESSAGE stays visible to every role, but the pay button is owner-only
> and non-owners get `ASK_OWNER_LINE`. Doing step 2 alone would have made things worse —
> it would have told a paid hub's member to "ask your owner to upgrade" when the owner
> already had.
>
> **⚠️ What this did NOT close — read before flipping the Paystack live key.**
> A green verification matrix above does **not** mean the live-key swap is clear. This was a
> **DISPLAY/UX-correctness** fix and nothing more — `hub_tier` grants nothing and gates no
> write. Draw the line precisely:
>
> **CLOSED here — display / UX correctness:**
> - Pay-for-nothing CTA: a non-owner can no longer be handed a checkout that upgrades their
>   own account while the hub's cap stays put (the original CAT01 finding).
> - The inverse false-cap bug: a member of a PAID hub is no longer shown "10 of 10",
>   truncated history and locked Pro skins that the server would in fact have accepted.
> - Both confirmed with test accounts across the full role × tier matrix.
>
> **What this left open at the time — now largely closed; updated 2026-08-25:**
> - ~~**Direct-write cap bypass.**~~ **CLOSED 2026-08-25.** The category and member INSERT
>   policies are now `WITH CHECK (false)` (`rls_budget_categories.sql` /
>   `rls_budget_centre_members.sql` v2, applied to production and verified live). A Free hub
>   can no longer be given an 11th category or an extra member through PostgREST — the RPCs
>   are the only write doors.
> - **History has no server enforcement — ACCEPTED, won't-fix (D3).** The 3-cycle Free window
>   is still `visibleCycleWindow()` in `useFinance`, client-side only, and
>   `GET /rest/v1/budget_cycles` still returns every cycle regardless of plan. Deliberate: a
>   soft Pro nudge over the user's OWN data, not a privacy boundary.
>
> So the "modified client can bypass the caps server-side" statement no longer holds for the
> **write** caps; it holds only for the history nudge, knowingly. Membership scoping was never
> in question — what was at stake throughout is *paid capability*, not another household's data.
>
> → Tracked in full below under **"Plan caps are not enforced at the RLS layer —
> direct-write bypass + history REST leak"** (the **P1 RLS sweep**), now RESOLVED for Leaks 1
> and 3. The two entries were always distinct risks and were closed separately, three weeks
> apart — this entry's green matrix was never cover for that one.
>
> **Smaller residual, same family:** the `/pricing` **route itself is still ungated**
> (`App.jsx` mounts it with no role/tier guard; `PricingView` keys only on the viewer's own
> `isPro`). No CTA leads a non-owner there any more, but one who types the URL directly
> still reaches a live checkout that upgrades their own account and moves nothing for the
> hub — the CAT01 path narrowed to manual URL entry rather than closed. This entry's stated
> fix shape called for gating "the cap CTAs **and** the `/pricing` entry"; only the CTAs
> landed. Low severity (requires deliberate URL entry, and an own-account Pro purchase is a
> legitimate product path — see the PlanSection copy entry), but it should be a conscious
> decision at live-key time rather than an oversight.
>
> Follow-on copy nit, non-blocking: see "PlanSection copy: 'upgrade your account' vs
> 'upgrade this hub'".

**Finding (CAT01 lineage).** The hub tier that governs Free-plan caps is the **owner's**,
resolved server-side. The client decides whether to offer the "Upgrade to Pro" path from
the **viewer's** own subscription via `useIsPro()` (`src/hooks/useIsPro.js`, a thin read of
`SubscriptionContext.isPro`). For a non-owner those are two different people. Result: a
**standard** member in a hub that has hit a Free cap is shown an upgrade CTA, can complete a
**real Paystack checkout**, upgrades *their own* user to Pro — and the hub cap does not move,
because it still resolves on the owner's (still-Free) tier. Money leaves, nothing unlocks.

**Two routes past the gate SidePanel applies:**
- `SidePanel.jsx:184` gates the Settings entry with `can('settings')` (false for standard),
  so the *panel* path to billing is correctly closed for non-owners — but
- `App.jsx:106` mounts `<Route path="/pricing" element={<PricingView />} />` with **no
  role/tier guard**; any authenticated member can reach it directly, and
- `BudgetView.jsx:196` — the category-cap `UpgradeModal` CTA calls `navigate('/pricing')`
  (the Log/Daily cap CTAs share the pattern), shown on the *cap* condition, not on
  `can('settings')`. The cap flow hands a standard member a live route to checkout.

**Fix shape.** Introduce a `useHubTier()` distinct from `useIsPro()`: `useIsPro()` answers
"is the signed-in user Pro" (correct for their own account / badges); `useHubTier()` answers
"is THIS hub Pro" (owner's tier — what caps key on). Gate the cap CTAs and the `/pricing`
entry on `useHubTier()` + ownership so only someone who can actually lift the hub's cap is
offered the purchase. Touches `BudgetView`, `LogView`, `DailyView`, and the `/pricing`
route guard.

**Open question 1 — severity switch — ANSWERED 2026-07-18: TEST mode.** Paystack is in
**test mode** (confirmed in the Paystack dashboard), so `PAYSTACK_SECRET_KEY` is `sk_test_…`
and **no real money can move**. Current severity: **UX/logic bug, not P0** — a standard
member can walk the checkout flow, but the charge is a test-mode no-op. (`checkout.js:14`
documents both key forms; the test hardcodes `sk_test_123`.)

**BLOCKER ON THE LIVE-KEY SWAP.** Severity flips to **P0 the instant `PAYSTACK_SECRET_KEY`
becomes `sk_live_…`** — at that point a standard member in a Free hub at a cap is charged
real cedis for a benefit that never lands. Therefore the `useHubTier()` fix below is **not a
floating post-MVP item: it is a hard prerequisite of the live-key swap and must land BEFORE
Paystack goes live.** Whoever flips the key must confirm this fix (or an interim
non-owner-CTA hide) is deployed first. Treat "go live on Paystack" as blocked on this row.

**Open question 2 — stale doc comment.** `api/paystack/checkout.js:20` still reads
"Ships DARK: no UI calls this yet (Commit 2 wires the pricing page)." No longer true —
`PricingView` is mounted and `BudgetView` navigates to `/pricing`. Correct the comment when
this is picked up so it stops implying the endpoint is unreachable.

**Schedule:** ~~UX bug while Paystack stays in test mode — but a **release blocker on the
Paystack live-key swap** (see OQ1). Ship `useHubTier()` before that swap, not after.~~
**DONE 2026-08-05** — `useHubTier()` shipped and live (see the RESOLVED banner at the top of
this entry). This entry's blocker is discharged. The remaining live-key consideration is the
**separate** RLS-enforcement entry below, which this fix did not address.

---

## Inactivity expense-reminder prompt — POST-MVP feature

**Idea.** Nudge a member who hasn't logged any expense for a stretch (e.g. N days) with a
gentle reminder to capture spending, so the budget doesn't silently drift out of date and
the "spent vs budget" health stays meaningful for people who log in bursts.

**Needs scoping:** the inactivity window and what counts as activity (any expense in the
active cycle? per-member vs per-hub?); delivery surface (in-app banner vs PWA push — push
needs the notification-permission plumbing); snooze/dismiss plus a per-user opt-out
(localStorage `ffc_` pref, UI-only per §11). A client-side last-activity check needs no
server work; push delivery would need a scheduled job.

**Schedule:** post-MVP. Engagement feature, not correctness.

---

## Receipt/invoice photo capture → OCR/vision auto-logged expense — POST-MVP feature

**Idea.** The end state of the phase-1 "attach photo to expense" feature: a member
photographs a receipt/invoice and the amount (ideally merchant/date/category too) is
extracted by OCR/vision and pre-filled into the Add-Transaction sheet, turning expense
logging into a snap instead of manual entry. Always confirm-before-save, never auto-commit.

**Needs scoping:** phase-1 is plain photo capture + attach; this item is the extraction
layer on top. OCR/vision provider (on-device vs a hosted API — the latter adds a dependency
and sends receipt images off-device, a privacy call for financial data); where extraction
runs (a serverless function like the Paystack ones, keeping keys server-only); mapping
extracted text → amount/category with a manual-correction step; image storage vs
discard-after-parse. Multi-currency parsing must respect the hub currency.

**Schedule:** post-MVP. Larger feature — new dependency + serverless surface + a review UI.
Scope as its own project once phase-1 photo capture lands.

---

## CI does not run on feature branches — they merge unverified — POST-MVP (tooling)

**Gap (verified against `.github/workflows/ci.yml`).** `push` triggers only on
`branches: [main, staging, dev]` and `pull_request` only on base `[main, staging]`. So a
`feature/**` branch gets **no CI run on push**, and a **PR into `dev` also skips CI** (dev
is not a `pull_request` base) — feature work can reach dev unverified unless the author runs
tests locally. The three-branch model (dev/staging/main) predates any feature-branch
convention.

**What:** decide the feature-branch naming convention (`feature/**`) and extend the triggers
to cover it — add `feature/**` to the `push` branch list (or a broader wildcard), and/or add
`dev` as a `pull_request` base so feature→dev PRs run the suite. Mind the existing
`paths-ignore: ['docs/**','**/*.md']` and the note at ci.yml:7 (no paths-ignore on PRs, so
required checks don't hang on docs-only PRs) when editing.

**Schedule:** post-MVP tooling. Pick up when a feature-branch workflow is actually adopted;
today all work lands directly on dev, which is covered.

---

## DPC registration (Ghana, Act 843) — ✅ FORM SUBMITTED 2026-08-25, awaiting DPC review

**This entry is the record of what we attested to.** If the DPC comes back with questions,
or if any declared fact later changes (new subprocessor, new recipient, new transfer
destination), this is the baseline to diff against — and a change to a declared fact means
the registration needs updating, not just the policy.

**Status:** submitted 2026-08-25. No decision yet; awaiting DPC review. Nothing to do until
they respond.

### What was declared

| Field | Declared value |
|---|---|
| Role | **Data Controller** |
| Organisation type | **Financial / fintech** |
| Data subjects | *(see "Data subjects" below)* |
| Security measures ticked | **Encryption**, **Password protected**, **Role-based access control** |
| Security measure deliberately NOT ticked | **Pseudonymisation** |

**Data subjects declared:** **`250+`** — the volume band entered on the form (confirmed
2026-08-29). This is a **declared fact**: if the actual number of data subjects moves out of
this band, the registration needs updating, not just an internal note.

### Why pseudonymisation was NOT ticked — deliberate, do not "correct" it later

Ticking it would have been a **false attestation**. Two independent reasons, both true of the
shipped schema:

1. **Transactions store names inline.** Transaction rows carry the member's name as text on
   the row itself, not only a surrogate key — so the financial records are directly
   identifying on their face, with no separate re-identification step.
2. **The identity mapping is one JOIN away.** Even for the ID-keyed paths,
   `budget_centre_members` → `auth.users` re-identifies any row in a single join inside the
   same database. Pseudonymisation requires the additional information that permits
   attribution to be **kept separately** and subject to technical/organisational measures
   preventing re-attribution; ours is in the same Postgres instance, reachable by the same
   credentials.

The three measures we *did* tick are all genuinely in place: Supabase encryption at rest +
TLS in transit (Encryption), Supabase Auth password/OAuth sign-in (Password protected), and
the `PERMISSIONS` map in `src/lib/roles.js` + Postgres RLS (Role-based access control).

**If pseudonymisation is ever ticked in a future filing, it must be earned first** — that
means separating the identity mapping, not re-reading the definition more generously.

### Open items that were flagged "resolve before DPC registration" and were NOT resolved first

The form went in ahead of two entries below that were scheduled to close before registration.
**Both are now ✅ CLOSED in the published policies** (2026-08-29, commit `592e1bd` → main
`21980dd`, verified live in the production bundle 23/23). Neither was declared inaccurately
on the form; the policies have now caught up with what the form said:

- **`cookies.md` full rewrite** — ✅ **DONE.** Replaced wholesale: no cookies, localStorage /
  sessionStorage only, no analytics or pixels, consent UI struck rather than built. Matches
  the "no cookie identifiers" position declared to the DPC. See the "Privacy/Cookie policy
  claims processing we don't do" entry.
- **Google OAuth undeclared in `privacy.md` §7** — ✅ **DONE in the policy.** Declared in
  §7.3 (recipient list) and new §7.4 (the transfer itself, Google as independent controller
  in the US). See the "Undeclared data recipient / international transfer" entry.

**⚠️ STILL OPEN — the submitted form, not the policy.** Fixing `privacy.md` does **not** fix
the filing. If the recipient list on the **submitted** DPC form does not name Google, that is
a gap to close **with the DPC**, not just in the policy — pull the submitted copy and check.
The policy and the registration are two separate records and they must agree.

**Also note:** the transactional-email entry warns that choosing a custom SMTP provider
(Resend / Postmark / Mailgun) adds a new declared Subprocessor and international transfer.
Registration having now been submitted, that change requires **updating the registration**,
not only `privacy.md` §7.3.

**Schedule:** no action while awaiting review. The two policy blockers above are now closed;
the one remaining pre-response task is verifying the **submitted form's** recipient list names
Google. On response: address whatever the DPC raises.

---

## Privacy/Cookie policy claims processing we don't do — analytics + email-open pixels aspirational — ✅ RESOLVED (privacy/terms `ffcf679`; cookies.md rewritten `592e1bd`)

**STATUS (2026-08-29): ✅ FULLY RESOLVED.** `cookies.md` was replaced wholesale by commit
`592e1bd` (promoted dev→staging→main as `21980dd`, 1703 tests, audit 299/299, CI green) and
**verified live in the production bundle** — all 4 JS chunks fetched from
family-finance-plum.vercel.app and grepped: 10/10 required new strings present, 13/13 phantom
strings absent (23/23). Details in the resolution note at the end of this entry.

**STATUS (2026-07-23): PARTIALLY RESOLVED.** The `privacy.md` + `terms.md` analytics claims
are removed and live-verified in production. The `cookies.md` pixel/cookie claims remain
open and now need a **full rewrite, not a strike-list** (see below).

**Finding (same class as the Resend subprocessor misstatement, commit `be790dd`).** The
published privacy and cookie policies describe analytics and email-open tracking the app
does not perform. Verified: **no analytics/telemetry SDK is integrated anywhere** — no
gtag / Google Analytics / Plausible / PostHog / Mixpanel / Sentry / Amplitude /
`@vercel/analytics` / Segment / Hotjar in `package.json` or `src/`.

**✅ CLOSED — removed by commit `ffcf679`, verified live in the production bundle
`App-CFNvf8HZ.js` (fetched from family-finance-plum.vercel.app, 0 occurrences of each):**
- **`privacy.md` §3.1(e)** — "to improve and develop the Service, including through
  aggregated and de-identified **analytics**". Removed.
- **`privacy.md` §10.1** — "we use cookies and similar technologies … with your consent
  where required, **for analytics**". Removed.
- **`terms.md` §12.1** — "**analytics providers** and integrations you choose to enable".
  Removed.

(Part of the 15-edit legal-accuracy pass, `ffcf679` → promoted dev→staging→main, CI green
on main run `30026893957`, then live-verified against the deployed bundle.)

**✅ NOW CLOSED (`592e1bd`) — was out of scope for that pass; the misstatements below are the
historical record of what the document used to claim:**
- **`cookies.md` §F.5 / §F.5.1** — "Analytics Technologies and Tracking Pixels"; "we **may
  use** analytics technologies and, in communications, **tracking pixels** to measure
  engagement (for example, whether an email was opened)". We run no email-open tracking:
  transactional mail is Supabase Auth's built-in sender (no open-tracking pixels), and there
  is no marketing-email system.
- **`cookies.md` §F.5 (line 26)** — an "Analytics / performance cookies" category described
  as in use; with no analytics SDK, no such cookies are actually set.

**Why it needed a FULL REWRITE, not a strike-list** (the reasoning that drove the fix — the
same audit found the document was wrong at a more basic level than the pixel claims):
- **We set no first-party cookies at all.** Client state is **localStorage / sessionStorage
  only** (`ffc_`-prefixed UI prefs; the Supabase auth token). A "Cookie Policy" built around
  first-party cookie *categories we set* is structurally inaccurate — the honest document
  describes localStorage/sessionStorage plus any third-party recipients (see the separate
  "undeclared recipients" entry below), not a first-party cookie taxonomy.
- **§F.3 promises a consent banner and a preference centre that don't exist.** No cookie-
  consent UI ships anywhere in `src/`. A live policy promising controls we don't provide is
  the same class of misstatement as the pixels.

**✅ RESOLUTION (2026-08-29, commit `592e1bd` → main `21980dd`).** Option A taken: a short,
truthful statement replacing the whole file. The promised §F.3 consent UI was **struck, not
built** — there is nothing requiring consent, so a banner would be theatre.

`cookies.md` retitled **Part F — Cookies & Local Storage** and now states: no cookies of any
kind; localStorage/sessionStorage only, with the actual keys named (`ffc_*` + the Supabase
auth token); the PIN is **not** stored on-device (hash lives in Supabase — only an unlock
flag + attempt/lockout counters are local); no analytics, pixels or advertising; no banner or
preference centre, and why; how to clear device storage; Vercel + Supabase server logs
including IP, on a legitimate-interests basis; and the Google/Paystack redirects. Added
**F.7.3**: the app loads *no* third-party resource at all (no external fonts, scripts or
CDNs), which makes the no-tracking claim structural rather than a promise.

`privacy.md` aligned in the same commit so it cannot contradict Part F: §2.1(b) drops cookie
collection *and* "pages and features accessed" (client-side routing never reaches a server,
so it is not logged); §4.1(b) consent example is now Google sign-in; §6.3 drops consent
records; §10 rewritten with a new §10.2 stating there is no banner. Nav labels + tests follow
the rename; the `/cookies` route is unchanged.

Verified against the code before publishing, not assumed: no analytics dependency in
`package.json`, no tracking reference in `src/` or `index.html`, `createClient()` on defaults
(localStorage, not cookies), and no `document.cookie` anywhere.

**Still open for the counsel pass:** `feature/legal-counsel-review` (DPO rename, §5.1 rights —
DO NOT MERGE until counsel opines) also edits `privacy.md` §5.1 and now **diverges from
production — it will conflict**; rebase it onto `main` before it lands. The Act 843
privacy-policy-contents review is likewise still outstanding. `privacy.md` §1.1 still carries
"[PENDING — application in progress]" for the DPC number, which is accurate while under review.

---

## Undeclared data recipient / international transfer — Google OAuth — ✅ RESOLVED (declared in `privacy.md` §7.3/§7.4, `592e1bd`)

**STATUS (2026-08-29): ✅ RESOLVED.** Google is now declared as a US recipient in
`privacy.md`, shipped in commit `592e1bd` (main `21980dd`) and verified live in the production
bundle — `Google LLC, a recipient located in the United States` and `Google LLC (federated
sign-in` both confirmed present in the deployed JS. See the resolution note at the end.

**Finding (same audit, 2026-07-23; Google Fonts ruled out on re-check — see below).** One
shipped third-party recipient receives user data — an international transfer to the **United
States** — but is named in **no** policy: not `privacy.md` §7 (International Transfers /
Subprocessors), not `cookies.md`. The DPC registration form requires declaring recipients and
their transfer destinations, so this blocks a truthful application.

- **Google OAuth** — "Continue with Google" sign-in (`AuthScreen.jsx:68-69`,
  `supabase.auth.signInWithOAuth({ provider: 'google' })`). Authenticating users hand data to
  Google (US). Genuine, shipped feature → it **must be declared** — add Google as a recipient
  / international transfer in `privacy.md` §7 (alongside Supabase / Vercel / Paystack) and
  reference it in the `cookies.md` rewrite.

**Google Fonts — NOT a recipient (ruled out 2026-07-23).** The initial audit flagged
`fonts.googleapis.com` from a `google-fonts-cache` service-worker rule in `vite.config.js`,
but verification against source and the **live deployed bundle** (HTML + CSS + JS) found **no
request ever fires**: `'Nunito'` is only a `font-family` name — no `@font-face`, `@import`,
`<link>`, or font file anywhere — so the browser falls back to `sans-serif` and never contacts
Google. A `runtimeCaching` rule only caches requests that are *made*; with none made it was
**dead config, now removed** (`vite.config.js` runtimeCaching deleted). No transfer happens,
so there is nothing to declare. Do **not** self-host to "fix" this — that would *newly*
introduce a Nunito load; the purely-visual font gap is tracked separately below.

**✅ RESOLUTION (2026-08-29, commit `592e1bd` → main `21980dd`).** Google declared in two
places, and `cookies.md` §F.7.1 cross-references the transfer:

- **`privacy.md` §7.3** — list widened from "Our principal **Subprocessors**" to "Our
  principal **Subprocessors and recipients**", adding `Google LLC (federated sign-in, where
  you choose "Continue with Google" — United States)` alongside Supabase / Vercel / Paystack.
- **`privacy.md` §7.4 (new)** — declares the transfer explicitly: what is exchanged (the auth
  request; email address + basic profile returned), that it happens **only** on an explicit
  "Continue with Google" click, that email/password sign-in is an alternative involving no
  transfer, and that Google acts as an **independent controller, not our Processor**.

**The "Subprocessor" wording was deliberately not reused.** In an OAuth flow Google does not
process on our instructions — it is an independent controller we send an authentication
request to. Filing it under "Subprocessors" would have misdescribed the relationship to the
DPC. Hence "Subprocessors **and recipients**" in §7.3 and the explicit characterisation in
§7.4. Do not "tidy" this back to a single word.

**Scope verified against the code, not assumed.** `AuthScreen.jsx` passes **no `scopes`** to
`signInWithOAuth` (only `redirectTo: window.location.origin`), so Google's default
`openid email profile` applies — matching the declared "email address and basic profile
information". Confirmed 2026-08-29 that the Supabase dashboard Google provider has **no
scopes field at all** (only Client IDs, Client Secret, skip-nonce, allow-users-without-email,
callback URL), so no broader scope can be configured server-side. Re-check this if the
provider config ever gains a scopes field — a widened scope changes a **declared fact** and
would require updating the DPC registration, not just the policy.

Also confirmed: **no Google-domain resource loads on page load** (no Fonts, gstatic, or tag
manager) — contact with Google happens only on an explicit click, which is what makes the
"user-initiated and avoidable" framing accurate.

---

## Transactional email sends from a `supabase.io` address, not `moneybos.com` — ⚠️ NOT A LAUNCH BLOCKER — pre-scale

**Read the status line first: this does NOT block launch.** The interim fix below is
deployed and is sufficient to go live with early users. This entry exists so the remaining
limitation is recorded, not to gate anything.

**✅ INTERIM — DONE, sufficient to go live now.** The Supabase auth email templates are
rebranded: subject lines and bodies say **Money B.O.S**. Password-reset and confirmation
emails *read* as ours. Good enough for early users, who are arriving via a link we gave them
and are not scrutinising the sender domain.

**⚠️ STILL TRUE — the limitation, for later.**
- **The sender is still a `supabase.io` address.** Supabase's SMTP settings are
  all-or-nothing: you cannot change the From address without configuring full custom SMTP.
  Template rebranding gets the *content*, never the *envelope*. Mail therefore arrives
  branded Money B.O.S from a domain that is visibly not moneybos.com — phishing-adjacent,
  and exactly the shape users are (rightly) trained to distrust for a **password reset on a
  finance app**. It also costs deliverability: no SPF/DKIM/DMARC alignment with our domain.
- **30 emails/hour rate limit** on Supabase's built-in sender. Fine at current volume;
  a hard ceiling the moment signup + reset traffic grows, and it fails *silently* from the
  user's side — they simply never receive the mail.

**REAL FIX — pre-scale, not pre-launch.** Configure custom SMTP so mail sends from
**moneybos.com** (e.g. `noreply@moneybos.com` as sender; keep `info@` as the human contact
address). Removes both problems at once — the rate limit and the mismatched sender.

**Blocker on doing it: no confirmed sending account.** The Mailgun DNS records exist, but
the Mailgun account is **unverified and may not exist at all** — establish that first rather
than assuming the DNS implies a working account. Alternatives if it's dead: **Resend** or
**Postmark** (Postmark has the stronger transactional-deliverability reputation; Resend is
the lighter integration).

**⚠️ Whichever provider is chosen, it becomes a declared Subprocessor.** `privacy.md` §7.3
currently lists exactly three — Supabase Inc., Vercel Inc., Paystack Payments Limited — and
transactional email is covered *implicitly* by the Supabase entry, because Supabase's
built-in sender is what we actually use. Commit `be790dd` removed Resend from that list
precisely because it was named but not integrated. Adding custom SMTP inverts that: the
provider becomes real and **must be added back to §7.3**, with its jurisdiction, as an
international transfer. If DPC registration has already happened by then, the declared
recipient list needs updating too (see the Google OAuth entry above). Don't let the
provider go live ahead of the policy — that's the same misstatement as `be790dd`, just
pointing the other way.

**Config lives in external dashboards, not the repo.** Supabase Auth → SMTP settings, plus
the provider's own console and the DNS records. There is no sender configuration in `api/`
or `src/` to change, so this cannot be verified by reading the codebase — check the
dashboards.

**Schedule:** before a real launch *push* / when signup + reset volume approaches 30/hr.
**Explicitly not blocking early testers.**

---

## 'Nunito' font declared but never loaded — app renders in default sans-serif — UI decision (POST-MVP)

**Not a compliance issue — purely visual.** `src/index.css` and inline styles across the app
set `font-family: 'Nunito', sans-serif`, but Nunito is **never actually loaded**: there is no
`@font-face`, no `@import`, no `<link>`, and no bundled font file. So every user currently
sees the browser's default `sans-serif`, not the intended Nunito. (Surfaced by the Google
Fonts recipient check, 2026-07-23 — see the Google OAuth recipients entry above.)

**Decide later, one of:**
- **Self-host Nunito properly** — add the `woff2` files to the repo + a local `@font-face`.
  This DOES create a font asset to bundle, but stays first-party — still **no third-party
  transfer** (contrast the abandoned Google-Fonts-CDN idea). Restores the intended look.
- **Drop the `'Nunito'` declaration** and pick a deliberate system font stack (e.g.
  `-apple-system, "Segoe UI", Roboto, sans-serif`). Zero bytes, no font asset, and honest
  about what actually renders.

**Schedule:** POST-MVP. No functional or legal impact; visual polish only.

---

## PlanSection copy: "upgrade your account" vs "upgrade this hub" — launch-quality UX polish

**Not a bug — a wording ambiguity.** A `full_access` non-owner viewing Settings in a hub
that is already Pro sees the Plan card read **"Free"** with a **"Upgrade to Pro"** CTA. That
is *correct*: `PlanSection` reads `isPro` from `SubscriptionContext`, i.e. the **viewer's own
account tier**, and subscriptions are account-scoped (`subscriptions.user_id`). Buying Pro
genuinely gets that member something — their own Pro hubs, up to 10 — so this is the same
legitimate own-account purchase path deliberately left open at `/pricing` when the
hub-scoped cap CTAs were owner-gated (see the freemium CTA entry above, and
`src/context/FinanceContext.jsx` for the `hubPlan` vs `userPlan` split).

**The confusion.** In a hub whose owner already pays, the member sees the hub behaving as
Pro (no caps, full history, Pro skins) while the Plan card says "Free" and offers "Upgrade
to Pro". Read as *"upgrade this hub"* that is nonsense — the hub is already Pro. Nothing
on the card says which of the two things the tier refers to.

**What:** make the card unambiguously about the viewer's own account.
- CTA `plan-cta`: `'Upgrade to Pro'` → **`'Upgrade your account to Pro'`** (or similar).
- Section heading `'Plan'` → consider **`'Your Plan'`**.
- Sub-copy `'Upgrade for more hubs, members and themes'` — "more hubs" is already
  account-scoped and correct; keep that framing and extend it to the CTA.
- Check the `isPro` strings too: `'Manage Plan'` / `"You're on the Pro plan"` carry the
  same ambiguity in reverse for an owner.
- Watch width: the card is a flex row with `whiteSpace: 'nowrap'` on the button at 390px —
  a longer label may need the CTA to wrap or move below the tier block.

**Files:** `src/views/settings/PlanSection.jsx` (+ `PlanSection.test.jsx`, which asserts the
current strings). Copy-only; no logic, no gating, no tier plumbing changes.

**Schedule:** launch-quality UX polish. Not blocking — the behaviour is already correct and
no one can be charged for something they don't receive.

---

## Invite link lands on "Sign in" when the invitee is almost always a NEW user — UX polish

**Why it's backwards.** `JoinView.jsx:26` initialises `const [authMode, setAuthMode] =
useState('signin')`. But an invite is, by definition, usually sent to someone who does not
have an account yet — that's what inviting them is *for*. The default puts the most likely
user on the wrong tab: they land on "Sign in", have no credentials, and must notice the
"Create account" toggle to proceed. Worst case they try to sign in, fail, and read the
failure as a broken invite link.

**What:** default `authMode` to `'signup'` on the invite-accept route, keeping the "Sign in"
toggle one tap away for the returning-user case (a member re-joining, or someone who
already signed up before opening the link).

**Refinement worth considering.** The invite row already carries `invited_email`, and
`accept_invite` is now email-bound (P0-A, `a7bd607`). So the *right* default is knowable
rather than guessed: if an account already exists for `invited_email`, default to sign-in;
otherwise sign-up. Doing that well needs an enumeration-safe existence check — we
deliberately avoid leaking "this email has an account" elsewhere (see the forgot-password
flow, `11bc4b9`). Absent that, plain "default to signup" is the better guess and carries no
disclosure risk.

**Files:** `src/views/JoinView.jsx` (+ `JoinView.test.jsx`, which asserts the current
default). Note the prefilled-email and signed-in-as-wrong-account branches
(`JoinView.jsx:127`) already handle their own cases and shouldn't change.

**Schedule:** UX polish. Not blocking — the path works, it just greets most invitees with
the wrong form.

---

## CYC02: a hub that runs out of budget periods fails every write with a generic "could not save" — UX / robustness

**Symptom.** Once a hub's last budget period elapses and no period covers the month being
written to, every financial write fails. The user sees only **"Could not save transaction.
Please try again."** — advice that is actively wrong, because retrying can never succeed.
Nothing on screen says a budget period is missing, and nothing offers to create one. The hub
looks broken.

**Root cause — not a bug in the guard, a gap in the surfacing.** Every financial row is keyed
on `cycle_id`, and the CYC02 invariant (client and server agreeing to refuse a NULL-cycle
row) is *correct and deliberate* — see engineering-decisions.md, "NULL keying column =
STRICT (raise CYC02)". The client guards refuse cleanly
(`useBudgetCentre.js:320`, `useIncomeMutations.js:211,250` → `No cycle for month X (CYC02)`)
and the DB trigger raises CYC02 behind them. The failure is that the views collapse that
specific, actionable condition into the same generic string every other error gets
(`AddTransactionSheet.jsx:105`, `AddCategorySheet.jsx:52`,
`IncomeSourcesSection.jsx:57`, `GuestTransactionForm.jsx:51`). The system knows exactly
what's wrong and doesn't tell anyone.

**The four fixes (recorded 2026-08-05, in rough dependency order):**

1. **End-of-period prompt — prevention.** Warn before the cliff: as the active period nears
   its end with no successor, prompt the hub to create the next one. This is the fix that
   stops most users ever meeting CYC02.
2. **Quick-create the covering month — recovery.** When a write does hit CYC02, offer a
   one-tap "create the budget period for {month}" inline, then retry the write. Turns a
   dead end into a two-tap recovery.
3. **Actionable CYC02 error on every write path — the floor.** Detect the CYC02 code and
   render a specific message instead of "could not save". **There is already a working
   precedent for exactly this shape**: `GuestTransactionForm` special-cases the `GST01`
   expired-session error into a distinct `guest-session-expired` prompt precisely because
   "retrying cannot help, only re-entering the PIN can" (`GuestTransactionForm.test.jsx:108`).
   CYC02 is the same class of error and deserves the same treatment. Cheapest of the four
   and worth doing even if the others slip.
4. **Guest form period awareness.** A guest submitting through `submit_guest_transaction`
   hits the same wall with even less context — they can't create a period, and may not know
   what one is. They need a message that tells them to contact the hub owner, not "could
   not save. Please try again."

**Schedule:** UX / robustness. Not a data-integrity risk — the guard is doing its job and no
bad row is written — but it presents as total breakage to the user, which makes it a poor
thing to meet at launch. Fix 3 is the minimum bar; fixes 1 and 2 are the real solution.

---

## `anon` holds full relation privileges on every app table, and every policy is `TO public` — defense-in-depth, not a live hole

**Found by preflight P4 of the RLS cap-enforcement sweep** (2026-08-22, read-only).

**The observation.** `pg_class.relacl` on `budget_categories` and `budget_centre_members` shows
both `anon` **and** `authenticated` holding `arwdDxtm` — the full letter set (read, add, change,
remove, empty, reference, trigger, maintain). Separately, **every** policy in `scripts/rls_*.sql`
is scoped `TO public`, which includes `anon`. The two together mean the unauthenticated role can
address every app table through PostgREST, and the *only* thing standing between it and the rows
is each policy's predicate.

**This is not a live vulnerability, and the reason is worth recording precisely.**
`is_budget_centre_member` resolves to `EXISTS (… WHERE user_id = auth.uid() …)`
(`scripts/is_budget_centre_member.sql`). For an anon request `auth.uid()` is NULL, so
`user_id = NULL` is NULL, no row matches, and `EXISTS` returns **false** — never NULL. It fails
closed, correctly, and `is_budget_centre_owner` has the same shape. Verified, not assumed.

**Why it is still worth recording.** The entire anon boundary rests on one helper's null
behaviour plus the discipline of never writing a permissive predicate. That discipline has
already failed once in this codebase: the world-readable invite SELECT policy dropped by
`migrate_26_invite_token_scope.sql` was exactly this class of bug — a policy open enough that
anon reachability turned it into a real finding (P0-A). The grant is what converts "a policy was
written too loosely" from a bug into an unauthenticated one.

**The cheap hardening, and why it is not a one-liner.** Scoping policies `TO authenticated`
instead of `TO public` removes the whole class. There is in-repo precedent — `rls_users.sql`
already scopes one policy that way. But it cannot be applied blindly:

- **The guest paths run as `anon`.** `authenticate_guest` and `submit_guest_transaction` are
  anon-callable `SECURITY DEFINER` RPCs, so their *writes* are unaffected by policy scoping. What
  is unknown is whether a guest session *reads* any table directly through PostgREST as `anon`.
  That is the question the sweep's preflight P5 was going to answer before Leak 2 was dropped as
  won't-fix, so it is now unanswered. **Trace the guest read path first** — this entry cannot be
  actioned without it.
- Withdrawing `anon`'s letters outright is the blunter version of the same fix and carries the
  same unknown.

**Explicitly out of scope for the RLS cap-enforcement sweep.** That sweep's invariant is that no
step edits a membership or role predicate; re-scoping every policy's role list is a larger,
different change with its own verification matrix. Recorded here so the P4 result is not lost.

**Schedule:** OPEN, defense-in-depth. Not a launch blocker — the helpers fail closed today.
Sequence: trace the guest read path, then re-scope policies `TO authenticated` table by table
with a MUST-PASS for the guest flow on each.

---

## Re-inviting a REMOVED member fails with a raw duplicate-key error — OPEN, pre-existing, NOT caused by the RLS sweep

**Found while preflighting Leak 3 of the RLS cap-enforcement sweep** (2026-08-22), answering a
different question: *does `accept_invite` resurrect a soft-deleted member row?* It does not —
and that is what exposes this. Recorded here so the sweep does not absorb the blame for a bug
that predates it by months.

**Symptom.** Owner removes a member, later re-invites the same person at the same email. The
invite sends, the link works, the invitee accepts — and the accept fails with an unhandled
Postgres `23505 duplicate key value violates unique constraint
"budget_centre_members_budget_centre_id_user_id_key"`. No friendly message; the raw error
surfaces through `JoinView`. The person cannot rejoin the hub, ever, at that address.

**The chain — four things that are each individually correct:**

1. `removeMember` **soft-deletes** (`src/services/members.service.js:55`) — sets `deleted_at`,
   leaves the row. Correct per CLAUDE.md §11 (soft deletes everywhere, audit history).
2. `budget_centre_members` carries a **FULL** unique constraint on `(budget_centre_id, user_id)`
   — `budget_centre_members_budget_centre_id_user_id_key` (`scripts/schema_base.sql:193`). Not
   partial: it does **not** exclude soft-deleted rows, so the removed member still occupies the
   pair.
3. `create_invite`'s already-a-member guard filters `deleted_at IS NULL`
   (`scripts/create_invite.sql:140-149`), so a removed member is correctly re-invitable — the
   invite issues normally.
4. `accept_invite`'s duplicate-membership guard **also** filters `deleted_at IS NULL`
   (`scripts/accept_invite.sql:117-125`), so it passes — and step 4 then runs a **plain
   `INSERT`** with no `ON CONFLICT` (`scripts/accept_invite.sql:157-160`), which collides with
   the leftover row.

Soft-delete + full unique + both guards scoping to *active* rows = the write is unreachable.
Each decision is defensible alone; together they close the door.

**Not a cap problem.** MEM01 counts active members only (`accept_invite.sql:147-150`), so the
cap arithmetic is right — the row never gets far enough for the cap to matter.

**Explicitly NOT caused by, or worsened by, the Leak 3 `deleted_at IS NULL` guard.** That guard
goes on the `budget_centre_members` **UPDATE policy**, which governs direct client `PATCH`
only. `accept_invite` is `SECURITY DEFINER`, so RLS does not apply to it at all. This bug fires
identically with the guard present or absent. The two are compatible by design and that is the
point: **the RPC may resurrect a member row; a raw PostgREST `PATCH` may not.**

*Status 2026-08-25:* that guard is now **applied to production and verified live**
(`scripts/rls_budget_centre_members.sql` v2 — see the RLS cap-enforcement entry below).
Nothing below changed when it landed: this bug fires identically with the guard present or
absent, because `accept_invite` is `SECURITY DEFINER` and RLS does not apply to it. The guard
does, however, now actively close the tempting client-side upsert "fix" described below — so
the only remaining route is the in-RPC `ON CONFLICT DO UPDATE`, which is still **unwritten**.

**Shape of the fix.** In `accept_invite` step 4, replace the plain insert with an upsert that
resurrects:

```sql
INSERT INTO budget_centre_members (budget_centre_id, user_id, role)
VALUES (v_invite.budget_centre_id, v_user_id, v_invite.role)
ON CONFLICT (budget_centre_id, user_id) DO UPDATE
  SET deleted_at = NULL,
      role       = EXCLUDED.role,
      joined_at  = now()
RETURNING id INTO v_member_id;
```

Safe because the function has already established, above that line, that the caller is the
invitee (INV01 identity binding), that they are not currently an active member, and that the
hub is under its MEM01 ceiling. The `DO UPDATE` can therefore only ever revive the exact row
the invite names. Ships with its own verify block and a re-invite-after-removal test.

**The fix that must NOT be taken — and it is the tempting one.** Do not move the resurrection
to the client as a PostgREST upsert (`POST` with `Prefer: resolution=merge-duplicates`, or
supabase-js `.upsert()`, carrying `deleted_at: null`). It reads as equivalent — same conflict
target, same end state, no SQL function to touch — and it is the exact vector Leak 3's UPDATE
guard exists to close:

- **It bypasses MEM01 entirely.** The cap lives *inside* `accept_invite` (step 3b,
  `accept_invite.sql:137-155`). A client upsert never enters the function, so a Free hub at 2/2
  seats a third member with no ceiling anywhere in the path.
- **It skips the INV01 identity binding**, so the party doing the resurrecting need not be the
  invitee — it only needs to be someone the UPDATE policy lets through.
- **Since Leak 3 v2 it fails anyway — but not for the reason most people would predict**, and
  the reason is worth stating so nobody "simplifies" the guard later. Postgres applies an INSERT
  policy's `WITH CHECK` **only to rows actually appended by the INSERT path**; when the conflict
  path is taken instead, `WITH CHECK (false)` is never evaluated and the INSERT deny is silent
  here. The write is governed by the UPDATE policy: `USING (... AND deleted_at IS NULL)` against
  the existing row, which the soft-deleted row fails. `ON CONFLICT DO UPDATE` **raises** on a
  `USING` failure rather than silently skipping the row the way a plain `UPDATE` does, so this
  fails loudly with a 42501 rather than as a no-op.

That last point is the one to carry forward: on this table the `deleted_at` guard on `USING` is
the **only** thing closing the upsert door, and anyone reasoning "INSERT is already denied, so
this clause is redundant" would reopen it. The split the two halves encode is
**the RPC may resurrect a member row; a client may not** — keeping the fix inside
`accept_invite` is what keeps that true.

**Confidence / provenance.** Read from repo source, not from production. The `UNIQUE` is
asserted in `scripts/schema_base.sql` and no later migration replaces it with a partial index
(`grep` over `scripts/*.sql` finds no other unique/index/`ON CONFLICT` statement on this
table). **Still to be confirmed against production** — a read-only check of the live
constraint and the live function body should run before the fix is written. It was drafted
into `scripts/rls_sweep_preflight.sql` and then removed: searching `pg_proc.prosrc` requires a
regex literal spelling out a write keyword, and the Supabase editor's pre-run text scan
matched that literal and warned of a schema change the read-only file did not contain. It
needs its own paste, written to avoid the literal. If the live constraint
turned out to be *partial* or absent, the bug changes shape rather than disappearing — the
insert would then succeed and leave a live row alongside the soft-deleted one, i.e. duplicate
member rows for one person, which `getMembers` would render twice.

**Related.** Nothing in `scripts/` or `src/` writes `deleted_at = NULL` to any table today, on
any path — the codebase has no resurrection flow at all. That is what makes the sweep's
resurrection guards free of legitimate-flow risk, and it is also why this gap went unnoticed.

**Schedule:** OPEN, low frequency but total when hit. Most likely on a **Free** hub, where the
2-member cap makes remove-then-re-invite a natural way to swap who is in the household. Worth
fixing before launch; a one-function change with no RLS interaction.

---

## Plan caps are not enforced at the RLS layer — direct-write bypass + history REST leak — ✅ RESOLVED 2026-08-25 for Leaks 1 + 3 (applied + verified live); Leak 2 = deliberate WON'T-FIX (D3)

> **RESOLVED — the write-cap leaks are closed in production.** Both `rls_*.sql` v2 files were
> run in the Supabase SQL editor and verified live with test accounts on **2026-08-25**.
> Code: dev `0737a01` → staging `b69cc72` → main `1d2e809`, 1700 tests green at each hop.
>
> **What was applied:**
>
> | Leak | Table | Change | State |
> |---|---|---|---|
> | 1 — category cap (CAT01) | `budget_categories` | `_insert` `WITH CHECK (false)`; `_update` `USING` gains `deleted_at IS NULL` + explicit `WITH CHECK` | ✅ applied + verified live |
> | 3 — member cap (MEM01) | `budget_centre_members` | `_insert` `WITH CHECK (false)`; `_update` `USING` gains `deleted_at IS NULL` + explicit `WITH CHECK` | ✅ applied + verified live |
> | 2 — history REST leak | `budget_cycles` | none | ❌ deliberate **WON'T-FIX** — see below |
>
> Both tables now have exactly one write door each: `create_category` /
> `create_categories_bulk` for categories, `create_hub` / `accept_invite` for members. The
> RPCs are unaffected — `SECURITY DEFINER`, and preflight P2 confirmed `FORCE ROW LEVEL
> SECURITY` is off. Both SELECT policies were recreated byte-identical to v1.
>
> **Live verification (test accounts, 2026-08-25) — the lockout risk is what mattered here,
> and it did not materialise:**
> - Fresh signup + onboarding — works (bulk category creation via the RPC path unaffected).
> - Add category / delete category — works.
> - Owner adds a member, changes a member's role, removes a member — all work.
>
> That covers the failure mode the plan was biased against: *"an over-tight predicate locks a
> real member out of their own hub, instantly, on shared prod."* It didn't.
>
> **Leak 2 — history REST leak — deliberate WON'T-FIX (Decision D3).** `GET /rest/v1/budget_cycles`
> still returns every cycle regardless of plan, and the Free 3-cycle window remains
> `visibleCycleWindow()` in `useFinance`, client-side only. The framing stands: this is a
> **soft Pro nudge over the user's OWN data, not a privacy boundary** — no household reaches
> another household's rows. Enforcing it server-side would mean filtering reads by cycle age,
> a different shape from the write caps, for a benefit that only accrues against someone
> hand-driving PostgREST to see data that is already theirs. Re-open only if history becomes a
> hard paid boundary rather than a nudge.
>
> **Bearing on the Paystack live-key swap.** The two *write* caps a paying hub actually
> depends on — categories and members — are now enforced at the RLS layer, not just behind the
> RPC front door. What remains open at live-key time is the ungated `/pricing` route (see the
> freemium-CTA entry above) and the accepted Leak 2 nudge. Neither is a cap bypass.
>
> **Historical record below** — the finding as originally written (2026-08-06). Kept for
> provenance; item 1 and item 3 are closed by the banner above, item 2 is accepted.

**Relationship to the freemium-CTA entry above.** That entry is RESOLVED: the client now
reads the hub OWNER's tier (`hub_tier` RPC → `hubPlan`), so cap DISPLAY matches what the
server enforces and nobody is sold an upgrade that does nothing. **CTA/display fixed there;
server enforcement tracked here.** `hub_tier` is display-only — it grants nothing and gates
no write. Everything below was true before that fix and is still true after it.

**The gap.** Cap enforcement lives entirely in the SECURITY DEFINER RPCs — `create_category`
(CAT01), `create_invite` (MEM01), `update_centre_skin` (SKN01), `create_hub` (HUB01). Those
are correct and owner-tier-aware. But **no RLS policy references `subscriptions` or `tier`
at all** (`grep -l 'subscriptions\|tier' scripts/rls_*.sql` → no matches). The RPCs are a
front door with a lock; PostgREST is an unlocked side door onto the same tables.

**Verified specifics** (read from the policy files, 2026-08-06):

1. **Category cap — direct-write bypass.** `budget_categories_insert` is
   `FOR INSERT TO public WITH CHECK (is_budget_centre_member(budget_centre_id))`
   (`scripts/rls_budget_categories.sql:27-29`). Membership is the *only* condition — no
   count, no tier. Any member of a Free hub can `POST /rest/v1/budget_categories` and add an
   11th, 50th, 500th category. `create_category`'s advisory lock and CAT01 check are simply
   not on that path.

2. **History — no server-side enforcement whatsoever.** The 3-cycle Free window is
   `visibleCycleWindow()` in `useFinance`, client-side only. `budget_cycles` SELECT is
   *"Members can view cycles in their hubs"* (`scripts/migrate_cycles_schema.sql:76-78`) —
   every cycle, no tier condition. A `GET /rest/v1/budget_cycles` returns the full history
   regardless of plan; likewise the transactions and categories hanging off hidden cycles.
   This was a deliberate call at the time (Decision D3: "soft Pro nudge over the user's OWN
   data, not a privacy boundary") — worth re-confirming that framing still holds when money
   is real, since it is the user's own data but it is also a *paid* feature.

3. **Member cap — owner-only direct-write bypass.** `budget_centre_members` INSERT is
   `WITH CHECK (is_budget_centre_owner(budget_centre_id))`
   (`scripts/rls_budget_centre_members.sql:29-30`). Narrower — only the owner can do it —
   but the owner is exactly the person who benefits from exceeding the member cap, so
   MEM01 is bypassable by the party it constrains.

**Severity framing.** This is a **revenue-integrity** issue, not a data-isolation one:
membership scoping holds throughout, so nobody reaches another household's data. What leaks
is *paid capability*. It needs someone willing to drive PostgREST directly with their own
token — not a casual user, but the app ships an anon key to the browser and the schema is
discoverable, so "modified client" is a realistic threat model for a paid product, not a
theoretical one.

**Shape of the fix (needs a design pass, not a patch).** Options, roughly ascending cost:
tighten the write policies to defer to the RPCs (e.g. revoke direct INSERT on
`budget_categories` from `authenticated` and route every write through the RPC — check what
else INSERTs there first, incl. onboarding and rollforward); or push the tier predicate into
RLS via a `hub_tier`-style STABLE helper. History is the awkward one — enforcing it server-
side means filtering reads by cycle age, which is a different shape from the write caps and
may not be worth it if D3's "soft nudge" framing stands.

**Schedule:** ~~OPEN. Weigh this before the Paystack live-key swap.~~ **CLOSED 2026-08-25**
for Leaks 1 and 3 — applied to production and verified live (see the RESOLVED banner at the
top of this entry). Leak 2 is a knowing, recorded acceptance under D3, not an oversight — the
bar this entry set was *"reasonable to ship with the gap knowingly accepted; not reasonable to
ship unaware of it"*, and that bar is now met.

---

## Privacy §2.3(c) ships the SOFTENED wording — restore the fuller clause if required/optional field indicators are ever added — POST-MVP (policy/UI drift risk)

**Context.** §2.3 was added 2026-08-30 (`a25d4f3`, live on main `737b050`) to close the Act 843
§23(d)+(e) gap — mandatory-vs-optional data, and the consequences of not providing it. Clauses
(a) and (b) carry the statutory content. Clause (c) is additive transparency and is **not**
required by §23.

**What was cut and why.** The clause was drafted as: *"Where the Service asks you for a
particular item of Personal Data, we will make clear at the point of collection whether that
item is required to proceed."* That was **not true of the UI** and was softened before shipping.
Verified at the time:

- Zero `required` / `aria-required` attributes anywhere in `src/**/*.jsx`.
- No asterisk or "(Required)" convention exists.
- `AuthScreen.jsx:122-148` collects name, email and password as three bare placeholder inputs
  with no required marking.
- Onboarding is the same shape — `StepCentre.jsx:79`, `StepCategories.jsx:91,99`,
  `StepIncome.jsx:52`, `StepTarget.jsx:57` are all bare placeholders.
- The only optional marking anywhere is three `"(optional)"` placeholders —
  `AddTransactionSheet.jsx:169`, `GuestTransactionForm.jsx:98`, `IncomeSourcesSection.jsx:106`.
  None are on signup or any account field.

**What shipped instead** (accurate to current behaviour): *"Optional fields are labelled as such
where they are collected. If you leave out an item that is required, the Service will tell you
before your entry can be submitted."* This describes **on-submit validation**, not
point-of-collection marking — `authValidation.js:12-17` ("Email is required" / "Password is
required" / "Please enter your name") and the empty-string reject at `lib/validation.js:63`.

**Trigger to revisit.** If required/optional indicators are ever added to `AuthScreen.jsx` and
the onboarding steps, (c) can be restored to the fuller point-of-collection wording — it would
then be true, and it is the stronger transparency position.

**Why this is flagged rather than left implicit.** The failure mode is silent drift in the
*other* direction: someone adds field indicators, the UI becomes better than the policy claims,
and nobody remembers the policy was deliberately weakened to match. Equally, nobody should
"tidy up" (c) back to the fuller wording without shipping the UI first — that re-opens the same
untruthful-claim problem this entry exists to record. Same class as the cookies.md rewrite: the
public legal text must match what the app actually does.

**Schedule:** POST-MVP. No action while the forms stay as they are — (c) is accurate today.

---

## §1.1 DPC number + the DRAFT banner — ✅ NUMBER LIVE, BANNER NARROWED 2026-09-01 (`908e3dc`); full removal still gated on counsel

**Registration granted.** DPC registration number **C0067637698**, certificate received
2026-09-01. `privacy.md` §1.1 now reads `Our Data Protection Commission registration number is
C0067637698.` — the `[PENDING — application in progress]` placeholder is gone. This supersedes
the "awaiting DPC review" status in the DPC registration entry above (submitted 2026-08-25).

**This entry originally concluded "Banner stays" until counsel. It didn't stay untouched — it was
narrowed.** Recording the deviation so the sequencing doesn't later read as a broken plan.

**Piece 1 — `privacy.md` §1.1. DONE.** One file, one line, exactly as predicted.

**Piece 2 — the DRAFT banner. PARTIALLY DONE — narrowed, not removed.** The original reasoning
still holds: the banner has TWO gates and spans FOUR files. What the original plan missed is that
leaving it byte-for-byte intact would have left all four docs asserting the Company "finalises its
Data Protection Commission registration" — untrue the moment the certificate landed, and untrue in
a public legal document. So the registration clause was cut and the counsel caveat kept:

- Before: *"…while the Company finalises its Data Protection Commission registration **and obtains
  formal counsel sign-off**. …once that process is complete."*
- After: *"…while the Company obtains formal counsel sign-off. …once that sign-off is obtained."*

The `⚠️ DRAFT — pending qualified Ghanaian counsel review.` heading and the "v1.0 final"
replacement promise are UNCHANGED — the docs still declare themselves draft. The
four-files-move-together rule was honoured: the narrowing went into `privacy.md`, `terms.md`,
`cookies.md` and `disclaimer.md` in the same commit, so no doc disagrees with another about its
own status.

**Still to do — the counsel gate.** When counsel signs off: remove the banner from all four docs
and stamp "v1.0 final", in one commit. That remains the `feature/legal-counsel-review` branch's
job (`345a97f`, still marked `[PENDING COUNSEL — DO NOT MERGE]`).

**Deploy note.** These docs are `?raw`-bundled into `App-*.js` via `LegalView.jsx:2-5`, so editing
the `.md` is inert until rebuild + deploy. Verify the string in the built/production bundle, not
just in the source file.

**Schedule:** blocked on counsel only. The DPC side is closed.
