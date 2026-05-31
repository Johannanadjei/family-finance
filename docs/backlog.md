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

## formatMonth helper duplication — POST-MVP code quality

The `formatMonth(ym)` helper is defined identically in 4 view files:
`IncomeSourcesSection.jsx`, `LogView.jsx`, `DailyView.jsx`, `PaydayView.jsx`. Pure
display helper (`'YYYY-MM'` → `"Month Year"` via `toLocaleDateString`), no business
logic. Should live in `lib/dates.js` alongside the other month helpers
(`getCurrentMonth`, `isPastMonth`).

**Schedule:** post-MVP code cleanup. Low priority — works correctly today, just
duplicated across four files.
