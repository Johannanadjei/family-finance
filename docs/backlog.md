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
