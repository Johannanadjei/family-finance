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
