# Family Finance — Claude Code Rules

This is the source of truth for all development on this project. Every rule here reflects
a deliberate architectural decision already in the codebase. Follow them exactly.
Where `ENGINEERING.md` conflicts with this file, this file wins — it's the current state.

---

## 1. Project overview

Family Finance is a household budget tracker for multi-member families. Families log income
and expenses, track spending against monthly category budgets, and confirm payday income each
month. The app is multi-currency, multi-member, and Supabase-backed. It runs as a mobile-first
PWA optimised for phones at 390px.

**Who uses it:** Households with multiple earners managing a shared budget. Members can be added
to a Budget Centre (the shared financial entity) and log transactions individually.

**Tech stack:** React + Vite, inline styles (no Tailwind), Supabase (Postgres + Auth + RLS),
Vitest + Testing Library, Vercel. Never suggest alternatives to any of these.

---

## DB vs UI naming

The database uses the original "centre" terminology. The UI uses "BOS Hub". These names are intentionally NOT synced:

- DB table: `budget_centres` (do not rename)
- DB column: `budget_centre_id` (do not rename — appears in 8+ FK relationships)
- DB enum value: `'business'` (the hub_type string value)
- Service-layer JSDoc: references "budget centre" — kept for DB traceability
- Internal `Error()` messages in hooks: reference "budget centre" — developer-only, not user-visible
- UI strings: always "BOS Hub" / "BOS Hubs"
- UI labels: "Business" (not "Small Business")

If a rename ever becomes necessary, treat it as a full migration project — not a cosmetic change. Affects RLS policies, FK constraints, ~200 code references, and live production data.

---

## 2. Architecture — data flow

```
Supabase
  └── services/          ← all DB calls live here, return { data, error }
        └── hooks/        ← useFinance, useBudgetCentre own all state + mutations
              └── context/ ← BudgetCentreContext, FinanceContext expose state app-wide
                    └── views/ ← read from context, pass derived values to sub-components
                          └── components/ ← pure display, receive props only
```

### Three-gate startup (App.jsx)

1. **Auth gate** — `useAuth()` returns no user → render `<AuthScreen />`
2. **Centre gate** — user exists but `needsOnboarding === true` → render `<OnboardingFlow />`
3. **Dashboard** — `<BrowserRouter>` with five routes, wrapped in both context providers

Never move gate logic out of `App.jsx`.

### Context split

**`BudgetCentreContext`** — static centre config:
- `centre` — Supabase centre row
- `categories` — current month's budget categories
- `members` — centre members with joined user rows
- `addCategory(category)` — mutation
- `fmt` — memoized currency formatter from `makeFmt(centre.currency)`
- `getCatIcon(name)` — emoji lookup for a category name

**`FinanceContext`** — live financial state. Exposes everything returned by
`useFinance({ centre, categories })`. App.jsx calls `useFinance()` once and passes the
result as the provider value — the hook is never called inside any view or component.

Read both contexts via `useBudgetCentreContext()` and `useFinanceContext()`.

---

## 3. Styling rules

### CSS variable tokens — the only source of colour

Never hardcode a hex value in a component. Always use `var(--c-token, fallback)`.

When a new colour is needed:
1. Add it to `THEMES.family_warmth` in `src/lib/themes.js` first
2. Reference it as `var(--c-new-token, hex-fallback)` in the component

Current tokens in `family_warmth`:

| Token | Value |
|---|---|
| `--c-primary` | `#064e3b` |
| `--c-primary-2` | `#0d7060` |
| `--c-accent` | `#059669` |
| `--c-accent-light` | `#f0fdf4` |
| `--c-header-from` | `#064e3b` |
| `--c-header-to` | `#0d7060` |
| `--c-text` | `#1c1917` |
| `--c-muted` | `#6b7280` |
| `--c-bg` | `#f3f4f6` |
| `--c-card` | `#ffffff` |
| `--c-border` | `#e5e7eb` |
| `--c-input-bg` | `#f9fafb` |
| `--c-input-border` | `#e5e7eb` |
| `--c-danger` | `#dc2626` |
| `--c-danger-bg` | `#fef2f2` |
| `--c-danger-light` | `#fca5a5` |
| `--c-success` | `#059669` |
| `--c-success-light` | `#6ee7b7` |
| `--c-warning` | `#d97706` |
| `--c-shadow` | `0 2px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)` |

Acceptable non-token values: `rgba(255,255,255,0.x)` overlays on gradient backgrounds,
`rgba(0,0,0,0.x)` for backdrop/shadow opacity.

### Layout constants (already established — stay consistent)

- View padding: `'16px'` on all four sides. Never `'16px 16px 0'`.
- Card border-radius: `16` (standard), `20` (hero/header cards)
- Card padding: `'16px 18px'`
- Card shadow: `boxShadow: 'var(--c-shadow)'` on every card surface
- Grid gap between stat cards: `12px`
- All styles are inline objects — no `<style>` JSX tags, no CSS-in-JS

### Hover states

Use `onMouseEnter`/`onMouseLeave` + local `useState` — `:hover` is not available in inline styles.

```jsx
const [hovered, setHovered] = useState(false);
<button
  onMouseEnter={() => setHovered(true)}
  onMouseLeave={() => setHovered(false)}
  style={{ background: hovered ? 'var(--c-accent-light)' : 'none', transition: 'background .15s' }}
/>
```

### Icons

Never use emoji as interactive UI elements. All buttons and controls use inline SVGs
with `aria-hidden="true"`. The `aria-label` goes on the button element, not the SVG.
Use `stroke="currentColor"` so icons inherit the button's colour token.

Established icons (reuse, don't reinvent):
- Info: 14×14 circle-i (`StatCard`, `Header`)
- Pencil/edit: 13×13 stroke path (`IncomeCard`)
- Trash: 14×14 stroke path (`TransactionRow`)
- Close/×: 16×16 two-stroke path (`SidePanel`)
- Settings gear: 18×18 circle + 8-spoke path (`Header`)
- Calendar: 18×18 rect + horizontal line + two date posts (`AddTransactionSheet`)

Emoji are acceptable in: empty-state decorations, user-generated content (income icons,
centre icons), and inline text labels (e.g. "💜 Payday Tracker").

---

## 4. Component rules

### Pure display components — the strict rule

Sub-components (`StatCard`, `CategoryBudgetRow`, `IncomeCard`, `TransactionRow`,
`BudgetHealthBar`, `MonthlyIncomeCard`, `RecentActivity`, etc.) **must not call `fmt()`**.

They receive pre-formatted strings as props from the view that owns them, or they call
`useBudgetCentreContext()` to get `fmt` if they need to format multiple values internally.
They never calculate — all derived values come in as props.

```jsx
// ✅ Correct — view formats, sub-component displays
// In HomeView.jsx:
<StatCard value={fmt(fixedTotal)} ... />

// In StatCard.jsx:
<p>{value}</p>   // receives a string, displays it

// ❌ Wrong — sub-component calculating or formatting
// In StatCard.jsx:
<p>{fmt(fixedTotal)}</p>  // StatCard has no business knowing about fixedTotal
```

### View orchestrators

Views (`HomeView`, `PaydayView`, `BudgetView`, `DailyView`, `LogView`) read from context,
own local UI state (sheet open, hover, mutating, error message), and pass derived values
down to sub-components. No Supabase calls or service imports in views.

### Skeleton pattern

Every async view must export a `*Skeleton` function defined just above the component export.
Skeletons render the same layout with `<Skeleton>` placeholders — no content.
Return the skeleton when `loading === true` before any other rendering.

```jsx
function BudgetViewSkeleton() { ... }

export function BudgetView() {
  const { loading } = useFinanceContext();
  if (loading) return <BudgetViewSkeleton />;
  ...
}
```

---

## 5. Mutation rules — optimistic update + rollback

Every write follows this pattern without exception:

```js
const mutate = useCallback(async (payload) => {
  // 1. Capture previous state for rollback
  const prev = state;

  // 2. Apply optimistic update immediately
  setState(optimisticValue);

  // 3. Write to Supabase
  const { data, error } = await dbMutation(payload);

  // 4a. Rollback on failure
  if (error) {
    setState(prev);
    return { error };
  }

  // 4b. Replace optimistic value with server row
  setState(serverValue);
  return { data, error: null };
}, [deps]);
```

Two-phase mutations (e.g. `markReceived`, `markPending`) roll back **both phases** if
either fails. See `useFinance.js` for the reference implementation.

Optimistic rows carry `_optimistic: true`. Components check this flag to apply reduced
opacity (0.6) and disable interactions.

---

## 6. Service layer rules

All Supabase queries live in `src/services/`. One file per table. Never import
`supabase` directly in hooks, views, or components.

Non-negotiable rules for every service function:
- Filter `deleted_at IS NULL` on every select
- Filter `budget_centre_id` on every select where applicable
- Soft delete only: set `deleted_at = new Date().toISOString()`
- Return `{ data, error }` — never throw
- Validate inputs with `lib/validation.js` before insert/update
- Use `.maybeSingle()` (not `.single()`) for single-row queries
- Month queries use date range (`date >= from AND date <= to`), not string matching

---

## 7. lib/finance.js rules

Pure functions only. No React, no imports from the app, no side effects, no async.
These functions are the only place financial calculations are performed.

Any new calculation must:
1. Be added to `lib/finance.js` as a named export
2. Be unit-tested in `lib/finance.test.js`
3. Be wired into `useFinance.js` as a `useMemo`
4. Never be duplicated in a component or view

Key functions: `calcTotalIncome`, `calcTotalSpent`, `calcTotalExpected`, `calcTotalReceived`,
`calcRemaining`, `calcHealthPct`, `getBudgetStatus`, `calcTotalFixed`, `calcFixedSpent`,
`calcVariableSpent`, `calcWeeklyData`, `calcCategorySpend`, `calcTopCategories`,
`calcDaysUntil`, `groupByDate`, `getIncomeStatus`, `makeFmt`, `getWeekForDate`,
`getCurrentMonth`, `offsetMonth`.

---

## 8. Test rules

- Every new component needs a test file next to it (`ComponentName.test.jsx`)
- Every new service function needs at least one test covering success + error paths
- All shared mock data lives in `src/test-utils/fixtures.js` — never define mock objects inside test files
- Never commit with failing tests
- Run `npm test -- --run` before every commit and verify the count matches

Available fixtures: `mockCentre`, `mockFmt`, `mockCategories`, `mockMembers`,
`mockIncomes`, `mockTxs`, `mockWeeklyData`, `mockCategorySpend`.

### What to test

- Rendered output from props (text content, `data-testid` values)
- Conditional rendering (tooltip shown/hidden, error state, empty state)
- Event handlers called with correct arguments and types
- Disabled states (button.disabled === true)

### What not to test

- Inline style values or CSS properties
- Hover state behaviour (mouse events)
- Supabase internals — mock at the service layer boundary

---

## 9. Commit rules

```
type(scope): short description, N tests
```

- `type`: `feat`, `fix`, `polish`, `refactor`, `test`, `chore`
- `scope`: always `v2` for this codebase version
- Always include the test count at the end
- Do NOT add a Claude `Co-Authored-By` trailer (or any AI co-author line) to commits in this repo.

```
feat(v2): add income source management, 423 tests
fix(v2): totalPending sums unreceived sources only, 423 tests
polish(v2): card shadows and token consistency, 423 tests
```

---

## 9.5. Triple-Check Pre-Commit Protocol

**This is mandatory. Run after tests and audit pass, before writing the commit message.**

Tests pass when mocks are incomplete. The audit checks code patterns, not semantic
correctness. Neither catches hooks-order violations, missing context destructures, or
broken permission gates. This checklist does.

### Step 1 — Run tests and audit (both must be green)

```
npm test
bash scripts/audit.sh
```

Zero failures required on both. If either fails, fix before proceeding.

### Step 2 — Read every modified file and verify:

- **Hooks called unconditionally** — no hook calls (`useState`, `useEffect`,
  `useContext`, `useCallback`, `useMemo`, `useNavigate`, `useRef`) after any
  conditional return. Permission guards (`if (!can(...)) return <AccessBlocked />`)
  must come AFTER all hook calls.

- **Context destructures are complete** — every value the component calls must
  be in the destructure from `useBudgetCentreContext()` or `useFinanceContext()`.
  If you add a `can()` call, add `can` to the destructure.

- **Error always alongside data** — every `const { data ... } = await supabase...`
  or `getUser()` call must also destructure `error`. `const { data, error }` not
  `const { data }`.

- **Optional chaining on nullable values** — any field access on a value that
  could be null or undefined uses `?.`. `data?.token` not `data.token`.

- **Stable useEffect dependencies** — dependency arrays must contain stable
  primitives (`centre?.id`, `user?.id`) never function references that recreate
  on every render (`getInvites`, `can`, `fmt`).

- **Test mocks include every context value the component uses** — if a component
  calls `can('x')`, the test mock must include `can`. If it reads `currentUserId`,
  the mock must include `currentUserId`.

### Step 3 — Verify permission gates

- Every new `can('permission')` call has that permission key in the `PERMISSIONS`
  map in `src/lib/roles.js` for all four roles.
- Every view that gates on role also has a test that renders the gated state.

### Step 4 — Verify new components

- Every new `.jsx` file has a corresponding `.test.jsx` next to it.
- The test covers: renders correctly, shows error state, handles empty state.

### Step 5 — Check for console.log

```
grep -rn "console.log" src/ --include="*.js" --include="*.jsx" | grep -v "test\."
```

Zero hits required. `console.error` in service/hook error paths is permitted.

---

**Why this rule exists:** The RBAC feature passed tests and audit but shipped with 6
bugs affecting real screens for non-owner members. Catching them before commit costs
5 minutes. Catching them after costs user trust. See engineering-decisions.md entry
dated 2026-05-25 for the full post-mortem.

---

## 9.6. Server-side RPC for cross-user writes

Any operation where a user writes to a table they don't own, or where the write
requires validation across multiple tables involving `auth.users`, **must use a
`SECURITY DEFINER` RPC function — never a direct client-side Supabase insert.**

### When RPC is required

- The calling user needs to insert into a table they are not yet a member of
  (e.g. joining a hub — the invitee is not yet in `budget_centre_members`)
- The write needs to validate data in `auth.users` server-side
  (e.g. PIN comparison, session validation)
- The write spans multiple tables and must be atomic
  (e.g. insert member row + mark invite accepted in one transaction)

### Established RPC functions in this codebase

| Function | File | Why RPC |
|---|---|---|
| `authenticate_guest` | `scripts/authenticate_guest.sql` | PIN hash comparison against `auth.users` |
| `submit_guest_transaction` | `scripts/submit_guest_transaction.sql` | Guest has no auth session; validated insert |
| `accept_invite` | `scripts/accept_invite.sql` | Invitee not yet a member; atomic member + invite update |

### Pattern

```sql
CREATE OR REPLACE FUNCTION my_rpc(p_param text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- All validation and writes here, runs as the DB owner
  -- auth.uid() is still available for the calling user's ID
END;
$$;
GRANT EXECUTE ON FUNCTION my_rpc(text) TO authenticated; -- or anon
```

```js
// services/something.service.js
export const doThing = async (param) => {
  const { data, error } = await supabase.rpc('my_rpc', { p_param: param });
  if (error) { console.error('[something.service] doThing error:', error.message); return { data: null, error }; }
  return { data, error: null };
};
```

### Rule

Never fight RLS with complex policies that join through `auth.users` or reference
subqueries across tables the calling user doesn't own. Write an RPC instead. It
takes the same amount of time, is transactional, and works reliably. The time lost
debugging RLS "permission denied for table users" errors exceeds the time to write
a 30-line SQL function.

### Locking down service_role-only RPCs (Supabase default ACL gotcha)

Any `SECURITY DEFINER` function that must be callable ONLY by the service role
(e.g. the revenue writer `apply_subscription_event`, called solely by the Paystack
webhook) **must explicitly REVOKE EXECUTE from `authenticated` AND `anon` — not just
from `PUBLIC`.**

Supabase ships a `pg_default_acl` that grants `EXECUTE` on every new function in the
`public` schema DIRECTLY to `anon` and `authenticated`. Those grants are **not**
inherited through `PUBLIC`, so `REVOKE ALL ... FROM PUBLIC` alone leaves them intact —
a signed-in client could call the function directly and (for a revenue RPC) self-upgrade.

Required order:

```sql
REVOKE ALL     ON FUNCTION public.my_rpc(...) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.my_rpc(...) FROM authenticated, anon;  -- the critical line
GRANT  EXECUTE ON FUNCTION public.my_rpc(...) TO service_role;
```

Always pair this with a self-verifying `DO` block that asserts `service_role` HAS
execute and `authenticated`/`anon` do NOT (via `has_function_privilege`). This is
what caught the gap during the `apply_subscription_event` rollout.

Confirm the default ACL on this project with:

```sql
SELECT defaclrole::regrole, defaclnamespace::regnamespace, defaclacl
FROM pg_default_acl WHERE defaclnamespace = 'public'::regnamespace;
```

NOTE — this applies only to RPCs meant to be service_role-only. The existing gate RPCs
(`create_hub`/`create_invite`/`accept_invite`/`create_category`/`update_centre_skin`/
`update_centre_currency`) are intended to be called by `authenticated` clients, so the
default `authenticated` EXECUTE grant is correct for them — not a security hole.

---

## 10. File structure

```
src/
  components/
    layout/         Header, BottomNav, FAB, SidePanel
    ui/             Skeleton, Toast, ErrorBoundary
  context/          BudgetCentreContext.jsx, FinanceContext.jsx
  features/
    onboarding/     OnboardingFlow, OnboardingProgress, steps/
  hooks/            useBudgetCentre.js, useFinance.js, useAuth.js, useCentres.js
  lib/              finance.js, themes.js, storage.js, supabase.js, validation.js, crypto.js
  services/         transactions.service.js, income.service.js, categories.service.js,
                    centres.service.js, guests.service.js
  test-utils/       fixtures.js  ← only file in here, never add more
  views/
    home/           StatCard, MonthlyIncomeCard, PaydaySummaryCard, BudgetHealthBar, RecentActivity
    daily/          TransactionRow, WeeklySummaryBar, AddTransactionSheet
    payday/         IncomeCard, ConfirmSheet
    budget/         CategoryBudgetRow, AddCategorySheet
    log/            LogFilterBar
    HomeView.jsx, DailyView.jsx, PaydayView.jsx, BudgetView.jsx, LogView.jsx, AuthScreen.jsx
  App.jsx           routing + three-gate logic only
  main.jsx          React root mount + PWA service worker registration
  index.css         resets, font, @keyframes fadeIn, :focus-visible, ::selection,
                    input[type="date"]::-webkit-calendar-picker-indicator
```

---

## 11. Key architectural decisions already made

These are the decisions that shaped the codebase. Don't revisit them without a strong reason.

**`useFinance` is called once in `App.jsx` and passed into `FinanceContext`.** Components
never call `useFinance` directly. This prevents multiple subscription instances and ensures
all views see the same state.

**All financial state resets when the month changes.** `loadMonth(ym)` calls `setActiveMonth`
and re-fetches from Supabase. There is no client-side caching of previous months.

**`totalPending` is computed from unreceived income sources directly**, not from
`totalExpected - totalReceived`. This ensures partial receipts don't create phantom pending
amounts.

**Soft deletes everywhere.** No row is ever physically deleted. `deleted_at` is set on
delete; all queries filter `deleted_at IS NULL`. This preserves audit history.

**Optimistic updates use `crypto.randomUUID()` for temp IDs**, replaced by the Supabase-
assigned UUID once the write confirms. The `_optimistic: true` flag gates interactions.

**`markReceived` is a two-phase write.** Phase 1 updates `income_sources.received`.
Phase 2 inserts an income transaction so it appears in `totalIncome` and `availableNow`.
Both phases must succeed; failure rolls back both.

**`fmt()` is a memoized factory result, not a hook.** `makeFmt(currency)` in `lib/finance.js`
returns a formatter function. `BudgetCentreContext` calls it once when currency changes and
memoizes the result as `fmt`. Sub-components either receive pre-formatted strings as props
or call `useBudgetCentreContext()` to access `fmt`.

**localStorage stores UI preferences only** — theme skin, accent, notification toggles.
Keys are prefixed `ffc_`. Financial data lives exclusively in Supabase.

**The 440px max-width container.** All views are constrained to `maxWidth: 440` centred
in the viewport. This means the app looks good on both phone screens and desktop browsers
without any responsive breakpoints.

**Inline styles only.** No Tailwind, no CSS modules, no CSS-in-JS. This was chosen for
simplicity and co-location — every component's styles are readable without leaving the file.

**RLS at the database level.** Row-level security is the primary access control mechanism.
The frontend anon key + user JWT enforce data isolation. The frontend never implements
its own access checks — it trusts Supabase RLS.

---

## 12. Never mask fetch failures as empty results

The service and hook layers MUST distinguish between (a) a successful fetch that
returned zero rows, and (b) a fetch that failed (network, 401, RLS block).

- Services return `{ data, error }` truthfully — never coerce an `error` into `data: []` or `data: null`.
- Hooks expose `{ data, loading, error, loaded }`. `loaded` is true only after a fetch completes without error.
- Views render: `loading` → skeleton; `error` → error state + retry; `loaded && data.length === 0` → empty state. The empty state ("No X yet…") renders ONLY for case (a).
- Every data hook's first fetch on mount awaits `waitForSession()` (`src/lib/auth.js`) so queries never fire against an unhydrated/stale token.

A failure must be visible in three places: hook state, the UI, and a test. See
docs/engineering-decisions.md (data-loss-on-refresh post-mortem).

**Why this rule exists:** a cold-load auth-token race let RLS-blocked queries return
`200 []`, which services collapsed to `data: []` and views rendered as an empty
dashboard — looking exactly like data loss. The token gate (`waitForSession`) is the
fix; truthful errors + the `loaded` flag are defense-in-depth. Note one limit: a pure
RLS-blocked `200 []` carries no error, so only the token gate prevents it — the
truthful-error layer cannot, and `lib/auth.js warnOnEmptyColdLoad` is the residual canary.
