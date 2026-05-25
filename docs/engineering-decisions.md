# Engineering Decisions — Family Finance Command Centre v2

## Format
Each entry records: what was decided, why, and what rule it produced.
Logged in chronological order. Never edited — only appended.

---

## [2026-05-18] Started from scratch — requirements first

**Context:**
Version 1 was built mock-data-first. UI was built before the database existed.
This caused structural debt that could not be patched: hardcoded constants,
currency-unaware formatters, RLS gaps, duplicate transactions, module-level
calculations that ran before data loaded.

**Decision:**
Rebuild from scratch using the correct order:
Requirements → Data model → RLS policies → Services → Hooks → UI

**Rules derived:**
- Never write a React component before its data layer is verified in Supabase
- Never use mock data in any file that will exist in production
- Never hardcode a financial value — it must come from Supabase

---

## [2026-05-18] Renamed 'household' to 'budget centre'

**Context:**
The app is not only for households. Users can create budget centres for
Airbnb properties, businesses, overseas residences, or any named financial
context. Calling everything a 'household' was misleading and caused confusion
in the UI and data model.

**Decision:**
The core financial unit is called a 'Budget Centre' throughout the app,
database, and code. Users name their centres whatever they want.

**Rules derived:**
- Never use the word 'household' in new code
- Database tables: budget_centres, budget_centre_members
- Context: BudgetCentreContext
- Hooks: useBudgetCentre

---

## [2026-05-18] Dual SELECT policies on every financial table

**Context:**
In v1, budget_categories had only a member-based SELECT policy.
The owner could not read their own categories immediately after creation
because the member row did not yet exist. This caused a silent empty
result that looked like a bug.

**Decision:**
Every financial table has TWO SELECT policies:
1. Member-based: is_budget_centre_member(centre_id)
2. Owner-based: is_budget_centre_owner(centre_id)

This ensures reads work at every stage of the lifecycle.

**Rules derived:**
- When adding a new table, always add both policies before writing any service code
- Test both policies with the Supabase role impersonation tool before shipping

---

## [2026-05-18] Unique constraint on income transactions at database level

**Context:**
In v1, duplicate income transactions were created because the application-level
idempotency guard checked in-memory state. On page reload, memory was empty
so the guard passed and duplicates inserted.

**Decision:**
Enforce uniqueness at the database level with a partial unique index:

  create unique index transactions_income_unique
  on transactions (budget_centre_id, category_name, amount, date)
  where type = 'income' and deleted_at is null;

**Rules derived:**
- Data integrity is enforced at the database level, not in application code
- Application-level guards are defence-in-depth only, never the primary protection
- Any record that must be unique needs a database constraint

---

## [2026-05-18] Soft deletes only — never hard delete financial data

**Context:**
Financial records must be auditable. A deleted transaction must be recoverable.
Hard deletes permanently destroy audit trails.

**Decision:**
All tables with financial data have a deleted_at column.
Deletes set deleted_at = now(). All queries filter where deleted_at is null.
No hard deletes ever on financial data.

**Rules derived:**
- Never write DELETE FROM on a financial table
- Always use UPDATE ... SET deleted_at = now()
- RLS policies have no DELETE policy — hard deletes impossible via the API

---

## [2026-05-18] Currency formatting via makeFmt — never hardcoded

**Context:**
In v1, fmt was hardcoded to GHS. Every user saw GHS regardless of their
budget centre currency. This was discovered only after the app was built.

**Decision:**
makeFmt(currency) creates a formatter per budget centre when the centre loads.
The formatter is stored in BudgetCentreContext and accessed via context hook.
No component ever imports fmt directly from lib/finance.js.

**Rules derived:**
- makeFmt is the only way to format currency in the app
- fmt is always read from context, never imported directly
- No component hardcodes a currency symbol or currency code

---

## [2026-05-18] Auto-trigger creates user profile on signup

**Context:**
In v1, the users table row had to be created manually after auth.
This caused race conditions where auth succeeded but profile reads failed.

**Decision:**
A Supabase trigger on_auth_user_created automatically creates:
- A public.users row with id, email, name
- A public.user_preferences row with default theme and notification settings

**Rules derived:**
- Never manually insert into users from application code
- The trigger is the single point of user creation
- Application code only reads and updates the user row, never inserts it

---

## [2026-05-18] Transaction currency defaults to centre currency

**Context:**
In v1 the currency was hardcoded to GHS on every transaction.
Users should never be forced to select a currency on every log entry.
But transactions can be in a different currency to the centre (e.g. overseas expense).

**Decision:**
Transaction currency defaults to the budget centre currency — pre-filled in the form.
The user can override it for individual transactions if needed.
The currency is stored on each transaction row for future conversion support.

**Rules derived:**
- Always pre-fill currency from the active budget centre
- Never force the user to select currency on every transaction
- Always store the original currency on the transaction — never assume centre currency

---

## [2026-05-19] Partial update pattern for service updates

**Context:**
`updateIncomeSource` originally called `validateIncomeSource(updates)` on a partial
object. `validateIncomeSource` expects a full object and sets defaults for missing
fields — meaning a partial update like `{ expected_amount: 5000 }` would overwrite
label, icon, pay_day, notes with empty defaults. Silent data corruption.

**Decision:**
All update functions use the partial update pattern — build a `cleaned` object,
only set fields that are explicitly provided in `updates`. Never pass partial
objects to full-object validators.

**Rule derived:**
Full validators (validateTransaction, validateIncomeSource etc) are for inserts only.
Update functions always build a cleaned partial object field by field.

---

## [2026-05-19] Permanent audit script at scripts/audit.sh

**Context:**
Manual audit commands were being regenerated each session, had grep pattern bugs
(matching comments, not matching multi-line imports, not resolving file extensions),
and were run from the wrong directory causing false passes.

**Decision:**
A permanent audit script at scripts/audit.sh with absolute paths, proven patterns,
and 12 check categories. Committed to the repo. Run with `bash scripts/audit.sh`
from any directory. Zero failures required before any commit.

**Rule derived:**
Never write audit commands inline in the terminal. Always use scripts/audit.sh.
If a new pattern needs checking, add it to the script permanently.

---

## [2026-05-19] Double-load bug in useFinance loadMonth

**Context:**
`loadTxs` and `load` had `activeMonth` in their useCallback dependency arrays.
When `loadMonth(month)` was called it:
1. Called `setActiveMonth(month)` — triggered re-render
2. Called `await load(month)` — loaded immediately
3. Re-render caused `activeMonth` to change — `loadTxs` recreated — `load`
   recreated — `useEffect` fired — loaded again

Two Supabase fetches for one user action.

**Decision:**
Removed `activeMonth` from `loadTxs` and `load` dependency arrays. Both functions
now always require an explicit `month` parameter. `useEffect` passes `activeMonth`
explicitly. `loadMonth` sets state and calls `load(month)` — the useEffect fires
but `load` is stable so no double fetch.

**Rule derived:**
Never use state values as default parameters in useCallback functions that are
also in the dependency array. Always pass values explicitly as parameters.
useState is for storage. useCallback deps are for referential stability.

---

## [2026-05-19] useFinance is a hook not a provider

**Context:**
Question arose whether useFinance values should be wrapped in a FinanceContext
so views can access them without prop drilling.

**Decision:**
useFinance is called once in App.jsx and its values are passed down. A thin
FinanceContext wrapper will be added in Session 5 when the dashboard shell is
built and we know exactly what each view needs. Adding a context before any
views exist would be premature architecture.

**Rule derived:**
Never create a context before its consumers exist. Build the consumer first,
identify the prop drilling pain, then extract to context.

---

## [2026-05-19] File size limits enforced by audit script

**Context:**
No rule existed for maximum file size. Long files are harder to reason about,
harder to audit, and usually indicate a file is doing too much.

**Decision:**
Limits enforced by scripts/audit.sh:
- Hooks: 400 lines max
- Services: 250 lines max
- Context files: 100 lines max
- Views and components: 200 lines max
- Lib files: 300 lines max (not yet in audit script — add when views are built)

**Rule derived:**
If a file approaches its limit, split it before adding more code. Never exceed
the limit by adding "just one more function".

---

## [2026-05-19] Email confirmation disabled for development

**Context:**
Supabase has email confirmation enabled by default. During development this
causes friction — every test signup requires checking email and clicking a
confirmation link. Rate limits also apply to confirmation emails.

**Decision:**
Email confirmation is disabled in Supabase Authentication settings during
development. When deploying to production, re-enable it under:
Authentication → Providers → Email → Confirm email → ON

**Rule derived:**
Never disable email confirmation in production. Always re-enable before
going live with real users.

---

## [2026-05-19] AuthScreen calls supabase.auth directly

**Context:**
All other Supabase operations go through services. AuthScreen is the one
exception — it calls supabase.auth.signInWithPassword, signUp, and
signInWithOAuth directly.

**Decision:**
Auth operations are not financial data operations. They do not need
validation, soft deletes, or the service layer pattern. Direct supabase.auth
calls in AuthScreen are correct and intentional.

**Rule derived:**
supabase.auth.* calls are permitted in AuthScreen only.
All other supabase.from() calls must go through services.

---

## [2026-05-19] Google OAuth deferred to Phase 2

**Context:**
Google OAuth requires a Google Cloud project, OAuth credentials, and
authorised redirect URIs configured in both Google Console and Supabase.
This is a standalone setup task independent of core financial features.

**Decision:**
Google OAuth button exists in AuthScreen but is deferred to Phase 2.
Email/password auth is sufficient for all development and testing.

**Phase 2 steps:**
1. Create Google Cloud project
2. Enable Google OAuth API
3. Add authorised redirect URI: https://family-finance-plum.vercel.app
4. Copy Client ID and Secret to Supabase Authentication → Providers → Google
5. Test full redirect flow end to end

---

## [2026-05-19] 4-digit PIN login — deferred to Phase 2

**Context:**
After initial setup, users should be able to set a 4-digit PIN for faster
login without re-entering their full email and password each time.

**Planned behaviour:**
- User sets PIN during or after onboarding in Settings
- On subsequent app opens, PIN screen shows instead of full auth screen
- PIN is hashed with SHA-256 before storing — same pattern as guest PINs
- PIN stored in user_preferences table — new column: pin_hash
- If PIN forgotten, user falls back to email/password login
- PIN is per-device — stored locally, verified against Supabase hash

**Phase 2 steps:**
1. Add pin_hash column to user_preferences table
2. Add PIN setup screen in Settings
3. Add PIN login screen — shown after session expires if PIN is set
4. Use existing hashPin and verifyPin from lib/crypto.js
5. Store PIN preference in localStorage — never the raw PIN

**Rule derived:**
PIN hashing for user login uses the same lib/crypto.js pattern as guest PINs.
Raw PIN never stored anywhere. Always hashed before any storage operation.

---

## [2026-05-19] World class engineering practices — what we are adding

**Context:**
Audit of current practices against world class standards revealed gaps
in testing, type safety, CI/CD, environment management, and documentation.

**Immediate additions to our rules:**

1. TESTING — Vitest for unit tests. All pure functions in lib/ must have
   tests. All validation functions must have tests. Tests run before every
   commit. No session is complete without passing tests for new logic.

2. ENV EXAMPLE — .env.example documents all required environment variables.
   Never commit .env files. Every developer knows what variables are needed.

3. README — setup instructions, tech stack, build commands, environment
   variables, deployment process. Updated whenever any of these change.

4. LAZY LOADING — views are lazy loaded via React.lazy() and Suspense.
   The initial bundle should only contain auth and routing logic.

5. GITHUB ACTIONS — audit script runs on every push to main.
   Build must pass. Audit must pass. No exceptions.

6. BRANCH STRATEGY — never commit directly to main after Session 6.
   Feature branches: feat/session-7-dashboard etc.
   Merge to main only after audit passes.

7. COVERAGE — test coverage reported after every test run.
   Target: 100% coverage on lib/finance.js and lib/validation.js.

**Phase 2 additions:**
- TypeScript migration
- Separate dev and prod Supabase projects
- Database migrations via Supabase CLI
- Sentry error monitoring
- E2E tests with Playwright
- Colour contrast and accessibility audit

---

## [2026-05-19] FAB bottom padding — Android vs iOS difference

**Context:**
FAB uses `calc(72px + env(safe-area-inset-bottom))` for bottom positioning.
On iOS Safari this works correctly. On Android Chrome the safe area inset
behaves differently, causing slight overlap with recent activity on some devices.

**Decision:**
Deferred to design pass session. Fix will require device-specific testing.
Potential fix: increase base padding from 72px to 88px as a safe default,
or use a fixed paddingBottom on the last HomeView element instead of relying
on the FAB height calculation.

**Rule derived:**
Always test fixed-position elements on both iOS and Android before marking
a UI session complete.

---

## [2026-05-19] data-testid pattern for value elements

**Context:**
React renders inline expressions like `Label: {fmt(value)}` as split text nodes.
`getByText('GHS 19,600')` fails because the full element text is
"Label: GHS 19,600" not "GHS 19,600". Regex workarounds are fragile.

**Decision:**
All value elements that need to be independently queryable in tests
must have a data-testid attribute:
  <span data-testid="suggested-surplus">{fmt(suggested)}</span>

This applies to all inline label+value patterns across the codebase.
Tests query by testid, not by text content, for values.

**Rule derived:**
Never use getByText() for formatted financial values inline with labels.
Always use data-testid on value spans. Apply this pattern to all new
components from this session onwards.

---

## [2026-05-19] act() warnings in useCentres.test.js — deferred fix

**Context:**
Two act() warnings appear in useCentres.test.js:
- "starts in loading state" test
- "sets error when fetch fails" test

These are warnings not failures. Tests pass. The warnings occur because
renderHook triggers async state updates after the test assertion completes,
outside of act(). This is a known React Testing Library pattern for async hooks.

**Fix when addressed:**
Wrap the loading state test in waitFor to let the async updates complete
before the test ends. Or use a suppressWarnings helper.

**Impact:** Zero — tests pass, no production code affected.

---

## [2026-05-19] FinanceContext planned for Session 10

**Context:**
After Session 9, financeValues is passed as props to Header, HomeView,
and PaydayView. Three consumers is the threshold for extracting to context.

**Decision:**
Session 10 will introduce FinanceContext wrapping useFinance values.
All views will read from context instead of receiving props.
App.jsx will be significantly simplified.

**Rule derived:**
When a prop is passed to 3+ consumers, extract to context.
Never create context before its consumers exist.

---

## [2026-05-19] Income sources are not month-scoped — known limitation

**Context:**
Income sources in Supabase have a single received flag per source.
When viewing a past month in PaydayView, the received status shows
the current state not the historical state for that month.

**Decision:**
Show a clear warning when viewing a past month:
"Income status shown reflects current state, not historical data.
Full historical income tracking is coming in a future update."

Phase 2: Add monthly income snapshots to track historical received state.

**Rule derived:**
Never show data that could mislead the user without a clear caveat.
Honest UI beats silent inaccuracy.

---

## [2026-05-20] Integration tests — deferred to Phase 2

**Context:**
Current test suite (347 tests) covers unit tests only:
- Component rendering tests with mocked context
- Pure function tests for all finance.js calculations
- No real Supabase calls — all services mocked at the hook level

**Gap:**
Integration tests would verify the full stack:
useFinance + services + optimistic updates + rollback on failure.
A bug in the service layer would not be caught by current tests.

**Decision:**
Phase 2 — add MSW (Mock Service Worker) integration tests.
MSW intercepts real HTTP calls to Supabase and returns mock responses.
This tests the full React + hook + service stack without a real database.

E2E tests with Playwright also deferred to Phase 2.
Live app verification after each session covers integration confidence
until MSW tests are added.

**When to add:**
Before any public launch or when the team grows beyond one developer.

---

## [2026-05-20] Income expected amount — edit UI and monthly reset

**Phase 1 (current):**
Edit pencil on IncomeCard expected amount — calls updateExpectedAmount.
When confirming received with a different amount — records actual received only.
No prompt about updating expected for next month.

**Phase 2:**
After confirming a different received amount, prompt user:
"You received X instead of Y. Update your expected amount for next month?"
Yes → updateExpectedAmount. No → keeps existing expected.

Monthly reset of income_sources.received flag — currently stays true after
confirmation and never resets. Phase 2: Supabase function or app-level check
on month change to reset received=false, received_amount=0 for the new month.

**Rule derived:**
Income sources are permanent records — not month-scoped.
Expected amount edits carry forward to all future months automatically.
Never lock users into onboarding values — make everything editable from the dashboard.

---

## [2026-05-25] Triple-check pre-commit rule — born from RBAC feature bugs

**Context:**
The member invites and RBAC feature was committed with 6 bugs that only surfaced during a
dedicated quality review after the commit. The bugs were:
1. JoinView rendered outside BrowserRouter — `useNavigate()` crashed immediately
2. SettingsView called hooks after a conditional return (Rules of Hooks violation)
3. PaydayView called hooks after a conditional return (Rules of Hooks violation)
4. `invites.service.js` member check used `.maybeSingle()` with no email filter,
   blocking all invites on multi-member hubs (PGRST116 on 2+ members)
5. Unsafe `getUser()` destructure in JoinView — crash on any auth network error
6. Unsafe `getUser()` destructure in useBudgetCentre — crash on any auth network error

Additionally during the final sweep: `canManage` used a hardcoded role check instead of
`can('manageMembers')`, `can` was never added to MembersSection's context destructure
(runtime crash for any non-owner), LogView had no role-based gating, and the HomeView grid
was broken for the 3-card layout used by standard/view_only members.

All of these passed `npm test` and `bash scripts/audit.sh`. Tests pass when mocks are
incomplete. The audit checks code patterns, not semantic correctness. Neither tool catches
hooks-order violations, missing context destructures, or broken permission gates.

**Decision:**
Add a mandatory pre-commit checklist that runs in addition to tests and audit. This is not
a process suggestion — it is a rule Claude Code must follow before every commit. The
checklist is mechanical and takes under 5 minutes. Skipping it is not permitted even when
the tests and audit are green.

**Rule derived:**
See CLAUDE.md section 9.5: Triple-Check Pre-Commit Protocol. Every item on that list is
required before `git commit` is run. Green tests and a green audit are necessary but not
sufficient conditions for a commit.

---

## [2026-05-25] Server-side RPC for cross-user writes — born from invite RLS failures

**Context:**
The `accept_invite` flow required an unauthenticated invitee to insert a row into
`budget_centre_members` (a table they are not yet a member of) and update a row in
`centre_invites`. Both operations require RLS policies that reference `auth.users` to
validate ownership and prevent abuse. Writing correct RLS for this is non-trivial:
policies that use subqueries joining through `auth.users` trigger "permission denied for
table users" errors because the calling user's JWT does not grant direct read access to
`auth.users` from within an RLS policy evaluation context.

Attempted approaches that failed:
- `USING (invited_email = auth.email())` — `auth.email()` is not available in all RLS contexts
- Subquery through `budget_centre_members` joining `users` — "permission denied for table users"
- Complex multi-table policy combining ownership and invite validity — same error, harder to debug

Hours were spent fighting RLS before the correct solution was identified: move the entire
operation into a `SECURITY DEFINER` function that runs with elevated privileges, keeping all
validation logic inside Postgres where it is atomic and unrestricted.

**Decision:**
Any write that crosses ownership boundaries or requires validation involving `auth.users`
uses a `SECURITY DEFINER` RPC function. This is the same pattern already established for
`authenticate_guest` and `submit_guest_transaction`. The pattern is now a permanent rule.

The `accept_invite` RPC:
1. Reads `auth.uid()` server-side — no userId passed from the client
2. Validates the invite (token, status, expiry) atomically
3. Guards against duplicate membership
4. Inserts the member row and marks the invite accepted in a single transaction
5. Returns `{ centreId, memberId }` as JSON

**Rules derived:**
- See CLAUDE.md section 9.6: Server-side RPC for cross-user writes
- Never attempt to solve cross-ownership write problems with RLS alone
- The RPC script lives in `scripts/` alongside the other RPC functions
- Every RPC function must be `GRANT EXECUTE`-d to the appropriate role (`anon` or `authenticated`)
