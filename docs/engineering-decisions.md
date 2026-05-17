# Engineering Decisions Log

This document records significant technical decisions, near-misses, architecture choices, and lessons learned during the build of the Family Finance Command Centre.

It serves as a living engineering playbook for this project and all future projects built by this team.

**Standing rules (agreed 2026-05-17):**
- No patches. No workarounds. No shortcuts.
- Every significant decision, near-miss, and lesson is logged here immediately.
- All code follows best practice. If the right way takes longer, we take longer.
- When a bug or issue is caught, we log it before fixing it.

---

## [2026-05-17] ENGINEERING.md vs engineering-decisions.md — purpose distinction

**Context:**
Two documentation files exist that could be confused.

**Distinction:**
- `ENGINEERING.md` — prescriptive rules and standards. How to write code in this project. Line limits, naming conventions, folder structure, prohibited patterns. Read this before writing any code.
- `docs/engineering-decisions.md` — retrospective decision log. Why specific choices were made, near-misses, lessons learned, known technical debt. Read this to understand the history and reasoning behind the architecture.

`ENGINEERING.md` answers: "How do I write code here?"
`engineering-decisions.md` answers: "Why does the code work this way?"

**Rule derived:**
Both documents must be maintained. When a new engineering rule is established, add it to `ENGINEERING.md`. When a decision is made or a lesson is learned, add it here immediately — not retrospectively.

---

## [2026-05-17] Never manually patch Supabase data to bypass a missing feature

**Context:**
After wiring `useHousehold` to Supabase, a signed-in Google user hit the onboarding placeholder because their auth account had no linked household. A quick fix was suggested: manually insert a `household_members` row in the SQL editor to link the user to the seed household.

**Why we did not do it:**
The manual patch would have worked temporarily but created a hidden dependency — a user account hardcoded to a seed household with no onboarding record, no ownership properly set, and no `owner_id` on the household row. This would have caused silent failures when:
- Onboarding flow was built expecting a clean state
- Subscription system checked household ownership
- Invite flows assumed only properly-onboarded users had households
- Data migration or user reset was needed

**Decision:**
Build the real onboarding flow. Every user who signs in with no household must go through onboarding. Onboarding creates the household, sets `owner_id`, adds the user as owner member, and seeds their categories and income sources.

**Rule derived:**
Never manually patch production or seed data to bypass a missing feature. If a flow is incomplete, build the flow. Workarounds in the database create invisible debt that compounds into critical bugs.

---

## [2026-05-17] Services layer must be created before hooks are wired

**Context:**
Before touching `useFinance.js` or any React component, we created the full services layer as pure async functions with no React dependencies.

**Why:**
- Services are independently testable without rendering anything
- Hooks import from services, never from Supabase directly
- If Supabase is replaced with another backend, only the services layer changes
- Follows the clean architecture chain: UI → Hooks → Services → Supabase

**Rule derived:**
Always build the data layer before the state layer. Never call Supabase directly from a React component or hook — always go through a named service function.

---

## [2026-05-17] Optimistic updates for all write operations

**Context:**
When `addTransaction` is called, the app updates local state immediately before the Supabase write completes. The Supabase call runs in the background and replaces the temp ID with the real UUID on success.

**Why:**
- Mobile finance apps must feel instant — waiting for a network round-trip before showing a transaction would feel broken
- This pattern scales naturally to offline support in Phase 3
- Consistent with how Monzo, Revolut, and other mobile finance apps behave

**Risk:**
If the Supabase write fails silently, the UI shows a transaction not in the database. Mitigation: error handling and a sync status indicator will be added in Phase 2.

**Rule derived:**
All write operations use optimistic updates. UI updates first, Supabase writes second. Always replace temp IDs with real Supabase UUIDs on successful write. Never block the UI on a network call.

---

## [2026-05-17] Postgres migration order — RLS functions must come after tables

**Context:**
First migration attempt failed with `relation "household_members" does not exist` because the `is_household_member()` security definer function was created before the `household_members` table existed.

**Rule derived:**
Always follow this exact order in Supabase/Postgres migrations:
1. Extensions
2. Utility trigger functions (e.g. `handle_updated_at`)
3. Tables — in foreign key dependency order
4. Indexes
5. Triggers on tables
6. Security definer functions — after the tables they reference
7. Enable RLS on all tables
8. RLS policies — after functions exist
9. Seed data — last, after all structure is in place

Never deviate from this order.

---

## [2026-05-17] Soft deletes on all tables — no hard deletes in application code

**Context:**
All tables include a `deleted_at timestamptz` column. No hard deletes are performed anywhere in the application.

**Why:**
- Users can recover accidentally deleted data within a 30-day window
- Audit trails remain intact for all records
- Future compliance (GDPR right to erasure) handled via scheduled purge job
- RLS policies and all queries consistently filter `where deleted_at is null`

**Rule derived:**
Never use SQL `DELETE` in application code. Always soft delete with `update set deleted_at = now()`.

---

## [2026-05-17] Data shape mappers at the boundary — never in components

**Context:**
Supabase returns snake_case columns and lowercase type values (`income`/`expense`). The app internally uses camelCase and capitalised types (`Income`/`Expense`). Mapper functions `mapTransaction()` and `mapIncome()` were added inside `useFinance.js`.

**Rule derived:**
Always map external data (Supabase, API, localStorage) to the app's internal model at the boundary — inside the hook or service layer. Never transform data inside a component. Never let database field names leak into UI code.

---

## [2026-05-17] Never use awk, sed, or shell one-liners to modify source code

**Context:**
We used `awk '!seen[$0]++'` to remove duplicate imports from `App.jsx`. The command deleted 40 lines of logic along with the duplicates, silently breaking the auth gate. We also used `sed -i` to add imports, which combined with a `git pull --rebase` caused the sed command to be replayed — resulting in double imports again.

**Why this is dangerous:**
- `awk` and `sed` operate on text patterns, not code structure — they cannot understand what they are deleting
- Silent failures — the command succeeds, the file is written, no error is shown
- `git rebase` replays local commits which can re-apply destructive text operations

**Decision:**
When a file needs to be fixed, rewrite the entire file using `cat > file << 'ENDOFFILE'`. This is the only safe method for modifying source files from the terminal in this project.

**Rule derived:**
Never use `awk`, `sed`, `echo >>`, or any shell text manipulation to modify source code files. If a file needs fixing, rewrite the whole file. Applies to all `.jsx`, `.js`, `.ts`, `.tsx`, `.json`, and `.md` files.

---

## [2026-05-17] useFinance accepts householdId with null-safe fallback to mock data

**Context:**
When wiring `useFinance` to Supabase, we needed a transition strategy that did not break the live app while the onboarding flow was being built.

**Decision:**
`useFinance(householdId = null)` accepts an optional `householdId`. When null, it falls back to localStorage and mock data. When a real `householdId` is provided, it loads from Supabase.

**Known debt:**
Once onboarding is complete and all users have real households, the mock data fallback and localStorage transaction writes should be removed. Phase 2 cleanup task.

**Rule derived:**
When migrating from one data source to another, use a null-safe pattern with explicit branching. Never do a hard cutover that breaks the app. Always have a working fallback until the new path is fully validated.

---

## [2026-05-17] localStorage kept as bridge during Supabase migration — intentional

**Context:**
After adding Supabase writes, `useFinance` still writes transactions to localStorage when no `householdId` is present. This was intentional — guest portal submissions have no auth user.

**Removal plan:**
Once onboarding is complete, remove localStorage transaction persistence for authenticated users. Guest portal submissions will eventually sync directly to Supabase using an anonymous session.

**Rule derived:**
Document intentional temporary bridges clearly. Explain when it should be removed and what the removal requires.

---

## [2026-05-17] calcTotalFixed() uses hardcoded constants — known technical debt

**Context:**
`calcTotalFixed()` sums the `FIXED_EXPENSES` constant array — a hardcoded list of 19 categories. After onboarding, budget categories will be stored in Supabase per household and can vary between users.

**Resolution plan:**
Phase 2 — `calcTotalFixed()` should accept a `categories` array parameter instead of reading from the constant. All callers in `useFinance` should pass `activeCategories` from Supabase.

**Rule derived:**
When a calculation function uses a hardcoded constant that will eventually be user-specific, log it immediately as technical debt. Do not wait until it causes a bug.

---

## [2026-05-17] budgetStatus returns an object — never render objects directly in JSX

**Context:**
`getBudgetStatus()` returns `{ label: string, color: string }`. In `HomeView.jsx`, `{budgetStatus}` was rendered directly in JSX causing React error #31 — a blank page in production with no visible error message.

**Fix:**
Changed `{budgetStatus}` to `{budgetStatus.label}`.

**Rule derived:**
Before rendering any value from a function or hook in JSX, always verify what type it returns. Functions that return objects must be explicitly accessed: `value.label`, `value.color`. Never assume a function returns a primitive. Add a JSDoc comment above complex return types.

---

## [2026-05-17] All hooks must be called before any conditional returns in a component

**Context:**
In an earlier version of `App.jsx`, hook calls were interleaved with conditional early returns, violating React's rules of hooks.

**Rule derived:**
In any React component, always call ALL hooks at the top of the function before any `if` statements or early returns. This is a React requirement. Violating it causes unpredictable bugs that are extremely difficult to trace.

---

## [2026-05-17] New files must be committed and pushed immediately after creation

**Context:**
Several files were created locally but never pushed to GitHub. Vercel deploys from GitHub, not the local machine, so production builds failed with `Could not resolve` errors. The local folder was also deleted and re-cloned at one point, permanently losing files that were never pushed.

**Rule derived:**
After creating any new file, immediately run:
Never leave new files uncommitted. The source of truth is GitHub, not the local machine. Before debugging any production error, verify the file exists on GitHub first.

---

## [2026-05-17] RLS chicken-and-egg on household creation

**Context:**
When a new user completed onboarding and clicked "Launch My Dashboard", the `createHousehold` service failed with "Could not create household". The insert succeeded but the subsequent `.select()` returned nothing because `households_select` used `is_household_member(id)` — the user was not yet a member when the select ran.

**Root cause:**
The membership row is inserted after the household row. Between those two operations, the user is an owner but not yet a member. The select policy only checked membership, not ownership.

**Fix:**
Added a second select policy `households_select_owner` that allows `owner_id = auth.uid()`. This lets the owner read their own household immediately after creation, before the membership row exists.

**Rule derived:**
When designing RLS policies for resources that are created by a user, always include an owner-based select policy alongside the member-based one. The creation flow always has a window where the creator is an owner but not yet a member.

---

## [2026-05-17] Onboarding default categories must be generic, not household-specific

**Context:**
`StepCategories` initially used `FIXED_EXPENSES` from `constants/index.js` as defaults. This list contained Adjei Family-specific categories (Elijah Driver, Levi Activities, Church/Tithe) that are meaningless to other users.

**Fix:**
Replaced `FIXED_EXPENSES` defaults with a clean generic list: Rent/Mortgage, Food & Groceries, Transport, Utilities, School Fees, Healthcare, Savings, Internet & Phone. All amounts start at 0 — the user fills them in.

**Rule derived:**
Onboarding defaults must be universally applicable. Never use household-specific seed data as onboarding defaults. Constants used for the Adjei Family demo should never bleed into the new user experience. When a constant is specific to one household, it must be scoped to that household only.

---

## [2026-05-17] Onboarding draft persistence — prevent data loss on refresh

**Context:**
Onboarding state lived only in React. Any page refresh, PWA background, or accidental navigation destroyed all entered data — household name, income sources, and categories all had to be re-entered from scratch.

**Decision:**
Added `onboarding.service.js` with `saveDraft`, `loadDraft`, `clearDraft`, `hasDraft`. Draft is saved to localStorage (`ff_onboarding_draft`) after every step navigation and after every category change. On return, a resume prompt asks the user if they want to continue or start again. Draft is cleared only after successful household creation.

**Rule derived:**
Any multi-step flow with user-entered data must persist its state to localStorage after every meaningful action. Never rely on React state alone for data that takes significant user effort to enter.

---

## [2026-05-17] Duplicate category detection — pure utility function in lib/

**Context:**
When users add budget categories during onboarding, they may accidentally add duplicates (e.g. "Food" and "food"). Detection logic belongs in a pure utility, not inside a component.

**Decision:**
Created `src/lib/categories.js` with `detectDuplicateBudgetCategory(newCat, existingCats)`. Normalises names by trimming, lowercasing, and collapsing spaces. Returns `{ isDuplicate, matchType, matchedCategory }`. Component shows a confirmation prompt — user can still add anyway.

**Rule derived:**
All data validation and matching logic belongs in `src/lib/` as pure functions. Never put business logic directly in a component. Pure functions are reusable, testable, and easy to find.

---

## [2026-05-17] Emoji picker — preset list, not full keyboard

**Context:**
Categories need emoji icons that carry through to dashboard, budget view, guest portal, and transaction log. A full emoji keyboard would be too heavy for onboarding.

**Decision:**
Built a preset `EmojiPicker` component with 28 common finance/family emojis. Tapping the icon button on any category row opens the picker. The chosen emoji is stored as `icon` on the category object, which is already in the DB schema. It flows through to all views that display categories.

**Future:**
A full emoji keyboard can replace the preset picker in settings without changing the data model.

**Rule derived:**
For MVP emoji/icon selection, use a curated preset list. Never add a full emoji library dependency to keep bundle size small. The data model must support the icon field from day one so future enhancement requires no schema change.
