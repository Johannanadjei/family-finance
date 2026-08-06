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
> **STILL OPEN — server-side enforcement, bears directly on a real-money launch:**
> - **History has no server enforcement at all.** The 3-cycle Free window is
>   `visibleCycleWindow()` in `useFinance`, client-side only.
> - **Direct-write cap bypass.** RLS carries no tier awareness anywhere — the category
>   INSERT policy tests membership and nothing else, so a Free hub can be given an 11th
>   (or 500th) category straight through PostgREST, routing around `create_category`'s
>   CAT01 check entirely.
> - **History REST leak.** `GET /rest/v1/budget_cycles` returns every cycle regardless of
>   plan, along with the transactions and categories hanging off the hidden ones.
>
> In short: **a modified client can still bypass the caps server-side.** The caps are
> currently enforced only by the front door (the SECURITY DEFINER RPCs); PostgREST is an
> unlocked side door onto the same tables. What leaks is *paid capability*, not another
> household's data — membership scoping holds throughout.
>
> → Tracked in full below under **"Plan caps are not enforced at the RLS layer —
> direct-write bypass + history REST leak"** (the **P1 RLS sweep**). That entry, not this
> one, is the item to weigh before real money moves. The two were always distinct risks;
> closing this one does not close that one, and this entry's green matrix must not be read
> as cover for it.
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

## Privacy/Cookie policy claims processing we don't do — analytics + email-open pixels aspirational — PARTIALLY RESOLVED (privacy/terms closed; cookies.md STILL OPEN)

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

**❌ STILL OPEN — `cookies.md` was out of scope for that pass and still misstates processing:**
- **`cookies.md` §F.5 / §F.5.1** — "Analytics Technologies and Tracking Pixels"; "we **may
  use** analytics technologies and, in communications, **tracking pixels** to measure
  engagement (for example, whether an email was opened)". We run no email-open tracking:
  transactional mail is Supabase Auth's built-in sender (no open-tracking pixels), and there
  is no marketing-email system.
- **`cookies.md` §F.5 (line 26)** — an "Analytics / performance cookies" category described
  as in use; with no analytics SDK, no such cookies are actually set.

**`cookies.md` needs a FULL REWRITE, not a strike-list.** The same audit found the document
is wrong at a more basic level than the pixel claims:
- **We set no first-party cookies at all.** Client state is **localStorage / sessionStorage
  only** (`ffc_`-prefixed UI prefs; the Supabase auth token). A "Cookie Policy" built around
  first-party cookie *categories we set* is structurally inaccurate — the honest document
  describes localStorage/sessionStorage plus any third-party recipients (see the separate
  "undeclared recipients" entry below), not a first-party cookie taxonomy.
- **§F.3 promises a consent banner and a preference centre that don't exist.** No cookie-
  consent UI ships anywhere in `src/`. A live policy promising controls we don't provide is
  the same class of misstatement as the pixels.

**Resolve before DPC registration:** rewrite `cookies.md` to match reality (no first-party
cookies; localStorage/sessionStorage; declare the real third-party recipients), and either
build the promised §F.3 consent/preference UI or strike those promises. Flag for the same
Ghanaian counsel pass as the parked `feature/legal-counsel-review` items (DPO rename, §5.1
rights — DO NOT MERGE until counsel opines) and the Act 843 privacy-policy-contents review.

**Schedule:** before DPC registration / before launch. Blocks a clean, truthful cookie policy.

---

## Undeclared data recipient / international transfer — Google OAuth — RESOLVE BEFORE DPC REGISTRATION

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

**Resolve before DPC registration:** declare Google OAuth in `privacy.md` §7. Same counsel
pass as the `cookies.md` rewrite.

**Schedule:** before DPC registration / before launch.

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

## Plan caps are not enforced at the RLS layer — direct-write bypass + history REST leak — OPEN, weigh before the Paystack live-key swap

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

**Schedule:** OPEN. Not a blocker on the freemium *UX* work, which is done. **Weigh this
before the Paystack live-key swap** — that decision should be made on this entry's merits
rather than inherited from the resolved entry above. Reasonable to ship with the gap
knowingly accepted; not reasonable to ship unaware of it.
