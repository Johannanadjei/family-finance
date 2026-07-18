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

## Freemium billing CTA escapes the settings gate — a standard member can pay for nothing — UX bug now, P0 on Paystack live-key swap

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

**Schedule:** UX bug while Paystack stays in test mode — but a **release blocker on the
Paystack live-key swap** (see OQ1). Ship `useHubTier()` before that swap, not after.

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
