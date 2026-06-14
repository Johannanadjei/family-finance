# Phase 0A — Static Source Inventory

**App:** Money B.O.S (household budget tracker) · React + Vite · Supabase · Paystack · Vercel PWA
**Status:** Reference material for Phase 1 (journey map). **Not committed.**
**Method:** Static read of `src/` — `App.jsx`, `lib/roles.js`, `lib/plans.js` read directly; views, modals/nav, services/forms/integrations, and gates/roles/data swept by parallel readers.

> ⚠️ **DB schema caveat.** Field lists in Section 9 are **inferred from service/validation code**, not from migrations. Confirm exact column names against `scripts/*.sql` in Phase 2 before relying on them for test data. One known correction already applied: the hub-owner column is **`owner_id`** (per `App.jsx:391` `c.owner_id === user?.id`), not `owner_user_id`.

---

## 1. Routes (App.jsx)

Routing lives **only** in `App.jsx` — three-gate startup then a `<BrowserRouter>` with seven routes inside `DashboardShell`.

### Pre-router gates (standalone, no chrome)

| Order | Condition | Renders | Notes |
|---|---|---|---|
| Path bypass | `pathname === '/join'` | `<JoinView>` (own BrowserRouter) | Bypasses **all** gates so unauthenticated invitees reach it |
| Auth | `authLoading` / `!user` | `LoadingScreen` / `<AuthScreen>` | |
| PIN | `!hasPinSetup && !pinSkipped` | `<PinSetupFlow>` | Skippable |
| PIN | `hasPinSetup && !pinUnlocked` | `<PinScreen>` | Lockout + forgot-PIN reset |
| Centre | `centreLoading` / `error` | `LoadingScreen` / `ErrorScreen` | |
| Centre | `needsOnboarding` | `<OnboardingFlow>` | |
| Centre | `removedFromHub` | `<RemovedScreen>` | Switch-hub / sign-out CTAs |

### Dashboard routes (inside `DashboardShell` → `<BrowserRouter>`, wrapped in `DashboardProviders`)

| Path | Component | Gated? | Chrome (Header / BottomNav / FAB) |
|---|---|---|---|
| `/` | `HomeView` | role-gated cards | Yes |
| `/payday` | `PaydayView` | `viewIncome` (AccessBlocked) | Yes |
| `/daily` | `DailyView` | filtered by `viewIncome` | Yes |
| `/budget` | `BudgetView` | `manageCycles` for create/reset | Yes |
| `/log` | `LogView` | `log`; `viewAllTxs`/`viewIncome` filter rows | Yes (receives `onEditTx`) |
| `/settings` | `SettingsView` | `settings` (AccessBlocked) | Yes |
| `/pricing` | `PricingView` | public to signed-in users | **Chrome-less** — `isPricing` hides FAB + BottomNav |

Shell-level overlays mounted regardless of route: `AddTransactionSheet`, `Toast` (income nudge + finance-error retry banner), `InstallPrompt`, `SidePanel`, `CreateHubSheet`.

---

## 2. Views (src/views/)

### Dashboard
| View | Purpose | Composes |
|---|---|---|
| `HomeView` | Current-period summary: income, budget health, spare, recent activity | MonthlyIncomeCard, PaydaySummaryCard, StatCard, BudgetHealthBar, RecentActivity |
| `DailyView` | Per-cycle txns grouped by day + weekly summary | TransactionRow, WeeklySummaryBar, MoveCycleSheet |
| `BudgetView` | Planned vs actual per category, sorted by % used | BudgetHeader, BudgetCategoryList, BudgetPeriodCreator, BudgetSheets |
| `PaydayView` | Income confirmation/tracking (received/pending/expected) | PaydayHeader, PaydayIncomeBody, PaydaySheets |
| `LogView` | Full txn history w/ type+category filter & search | PeriodNav, TransactionRow, LogFilterBar, MoveCycleSheet |

### Settings
| View | Purpose | Composes |
|---|---|---|
| `SettingsView` | Hub mgmt hub | Centre/Plan/IncomeSources/Categories/Members/Guests/Security/Theme/InstallApp sections |
| `PricingView` | Free vs Pro upgrade, monthly/annual toggle | BillingToggle, PlanCard |

### Auth / Join
| View | Purpose |
|---|---|
| `AuthScreen` | Email/password + Google OAuth sign in/up |
| `JoinView` | Invite-token acceptance flow (auth + join) → `BrandLockup` |

### Full-screen / standalone
| View | Purpose |
|---|---|
| `PinScreen` | PIN login gate, lockout countdown, forgot-PIN → PinPad |
| `PinSetupFlow` | Two-step PIN creation → PinPad |
| `GuestPortal` | Guest shell, PIN-only (no Supabase Auth) → GuestPinScreen, GuestTransactionForm |

### Sub-component folders
`budget/` (AddCategorySheet, BudgetCategoryList, BudgetEmptyState, BudgetHeader, BudgetPeriodCreator, BudgetSheets, CategoryBudgetRow, CopyCategoriesSheet, CreateBudgetPeriodSheet) · `daily/` (AddTransactionSheet, FromSpareToggle, MoveCycleSheet, TransactionRow, WeeklySummaryBar) · `home/` (StatCard, MonthlyIncomeCard, PaydaySummaryCard, BudgetHealthBar, RecentActivity) · `payday/` (ConfirmSheet, CopyIncomeSheet, IncomeCard, MonthEmptyState, NoIncomeSourcesEmpty, PastIncomeCard, PaydayHeader, PaydayIncomeBody, PaydaySheets, UpdateReceivedSheet) · `log/` (LogFilterBar) · `settings/` (AddGuestSheet, ArchiveHubSheet, CategorySettingsRow, CentreSettingsSection, GuestSettingsSection, IncomeSourceRow, IncomeSourcesSection, InstallAppSection, MemberRow, MembersSection, PlanSection, SecuritySection, ThemeSection) · `guest/` (GuestPinScreen, GuestTransactionForm) · `pin/` (PinPad) · `join/` (BrandLockup).

---

## 3. Modals / Sheets / Overlays

| Component | Trigger | Primary CTA(s) | Routes / Action |
|---|---|---|---|
| **UpgradeModal** | HubFooter (hub cap), PeriodNav (history lock), gate consumers | "Upgrade to Pro" / "Got it" | `onUpgrade()` → **navigate `/pricing`**; else dismiss |
| **ConfirmModal** | BudgetView past-period guard; generic confirm | Continue / Cancel (`confirmTone='danger'`) | Runs mutation / dismiss |
| **Toast** | After expense log; copy success; finance-fetch error | "Edit"/"Retry"/custom + dismiss | callback (open edit, `reload()`) / dismiss |
| **InstallPrompt / InstallBanners** | Auto on load (Android native / iOS manual) | Install / dismiss | PWA install or sessionStorage dismiss |
| **AccessBlocked** | Standard role on `/payday`, `/settings`, `/log` | none | Static block message (full-page, not modal) |
| **CreateHubSheet** | HubFooter / SidePanel "+ New BOS Hub" | Type→Name→Categories→Income→"Create Hub 🎉" | `onComplete(centreId)` → navigate `/` |
| **AddCategorySheet** | BudgetView add / empty state | Save / Cancel | `onAdd({name,icon,budget_amount,is_fixed,month,sort_order})` |
| **CopyCategoriesSheet** | BudgetView rollforward / empty | "Copy N selected" / Cancel | `onCopy(ids)` |
| **CreateBudgetPeriodSheet** | BudgetView new period | choose next-month / custom / "Create period" | `onCreate()` → `create_budget_period` RPC |
| **BudgetSheets** | (host, no trigger) | — | Mounts AddCategory/CopyCategories/toast |
| **AddTransactionSheet** | FAB (any tab); LogView edit | Expense/Income toggle, Save/Save Changes | `addTransaction()` / `updateTransaction()` → `onSaved(tx)` |
| **MoveCycleSheet** | DailyView/LogView txn → move | "Move" / Cancel | `onMove(cycleId)` |
| **ConfirmSheet** (payday) | PaydayView "Confirm Receipt" | "Confirm Receipt" / Cancel | `onConfirm(sourceId,amount,date)` |
| **CopyIncomeSheet** | PaydayView new-month empty | "Copy N selected" / Cancel | `onCopy(ids)` |
| **UpdateReceivedSheet** | Auto after editing expected on a confirmed source | "Yes, update" / "No, keep" | `onConfirm` / `onDismiss` |
| **PaydaySheets** | (host, no trigger) | — | Mounts ConfirmSheet/CopyIncome/toast |
| **AddGuestSheet** | SettingsView add/edit guest | Save Guest / Cancel | `onSave()` (name, PIN hash, allowed categories) |
| **ArchiveHubSheet** | SettingsView "Archive Hub" | Archive → or name-match "Delete Forever" | `onArchive()` / `onPermanentDelete()` |
| **SidePanel** | Header tap | hub switch, create hub, restore, sign out | `onSwitch`+navigate `/`; `closeForNavigation` before `/pricing` |

All sheets/modals use **`useModalChrome`** (scroll-lock on `#app-shell`, Esc close, history-back close with `dismissForNavigation()` to avoid double-pop on `/pricing` routing).

---

## 4. Forms & User Input (Supabase writes)

| Form / View | Entity | Required fields | Mutation path |
|---|---|---|---|
| Onboarding StepCentre | budget_centre | name, currency, icon, type, surplus_target | **RPC** `create_hub` |
| Onboarding StepIncome | income_sources (bulk) | label, icon, expected_amount, currency, pay_day, pay_day_type | direct `bulkAddIncomeSources` |
| Onboarding StepCategories | budget_categories (bulk) | name, icon, budget_amount, is_fixed, sort_order (≤10 free) | **RPC** `create_categories_bulk` |
| AddTransactionSheet | transactions | amount>0, category_name, date, type | direct `addTransaction` / `updateTransaction` |
| AddCategorySheet | budget_categories | name, budget_amount, icon, month | **RPC** `create_category` (CAT01) |
| CategorySettingsRow | budget_categories | name/icon/budget_amount/sort_order | direct `updateCategory` / `deleteCategory` (soft) |
| CreateBudgetPeriodSheet | budget_cycles | startDate, endDate, name? | **RPC** `create_budget_period` |
| BudgetPeriodCreator (reset) | cycles+categories+txns | — | **RPC** `reset_budget_period` (future-only) |
| IncomeSourceRow / Settings | income_sources | label, expected_amount, currency, pay_day(_type) | direct `updateIncomeSource` / `deleteIncomeSource` |
| ConfirmSheet / UpdateReceivedSheet | income_sources (+txn) | receivedAmount, actualPayDate | direct `markReceived` (**2-phase**) / `markPending` |
| MembersSection | centre_invites | email, role (full_access\|standard) | **RPC** `create_invite` (MEM01) |
| JoinView | members + invite | token, name? | **RPC** `accept_invite` |
| MemberRow | budget_centre_members | — | direct `removeMember` (soft, owner-guarded) / `updateMemberRole` |
| AddGuestSheet | guest_users | name, pin(4-digit hashed), allowedCategories | direct `createGuestUser` / `updateGuestUser` |
| GuestTransactionForm | transactions | amount, categoryName, description, date, week, currency | **RPC** `submit_guest_transaction` |
| PinSetupFlow / SecuritySection | users.pin_hash | pin (hashed client-side) | direct `savePinHash` / `clearPinHash` |
| CentreSettingsSection | budget_centres | name, currency, surplus_target, icon, timezone | direct `updateCentre` |
| ThemeSection | budget_centres.skin_id | skin_id | **RPC** `update_centre_skin` (SKN01) |

---

## 5. Role-Gated Features

**Roles:** `owner` > `full_access` > `standard`. `can(role, permission)` in `lib/roles.js`; context exposes role-wrapped `can(permission)` via `useBudgetCentreContext()`.

**PERMISSIONS map (verbatim):**

| permission | owner | full_access | standard |
|---|:-:|:-:|:-:|
| log | ✅ | ✅ | ✅ |
| logIncome | ✅ | ✅ | ❌ |
| viewIncome | ✅ | ✅ | ❌ |
| settings | ✅ | ✅ | ❌ |
| manageMembers | ✅ | ❌ | ❌ |
| viewAllTxs | ✅ | ✅ | ❌ |
| viewBalance | ✅ | ✅ | ❌ |
| manageCycles | ✅ | ✅ | ❌ |

`INVITABLE_ROLES = ['full_access','standard']` (owner cannot be invited).

**Call sites (gate → effect):**
- `App.jsx` FAB → `log` (hidden for standard)
- `LogView` → `log` (AccessBlocked), `viewAllTxs`/`viewIncome` (row filtering)
- `PaydayView` → `viewIncome` (AccessBlocked)
- `SettingsView` → `settings` (AccessBlocked)
- `HomeView` → `viewIncome`, `viewBalance` (hide cards)
- `DailyView` → `viewIncome` (filter list)
- `AddTransactionSheet` → `logIncome` (hide Income tab)
- `BottomNav` → role filters Payday tab
- `SidePanel` → `settings` (HubFooter / settings affordances)
- `MembersSection` → `manageMembers` (**owner-only** invite/remove/role)
- `BudgetView` / `BudgetHeader` → `manageCycles` (create/reset disabled)
- `useBudgetCentre.updateCentre` → `settings` guard

**AccessBlocked** renders full-page on `/payday`, `/settings`, `/log` for standard members.

---

## 6. Cap Gates (Freemium)

Free limits (`lib/plans.js`): 1 hub · 2 members · 10 categories/cycle · 2 income streams · 3 months history · `family_warmth` skin only. Pro: 10 / 15 / ∞ / ∞ / ∞ / all skins.

| Gate | Code | Trigger condition | Free→Pro | Enforcement | UpgradeModal body |
|---|---|---|---|---|---|
| Hub create | `HUB01` | owned hubs ≥ maxHubs | 1→10 | **RPC** `create_hub` (SQLSTATE) | DEFAULT_BODY |
| Member invite | `MEM01` | active members + pending invites ≥ limit | 2→15 | **RPC** `create_invite` | MEMBER_CAP_BODY |
| Category (site A: BudgetView/AddCategorySheet) | `CAT01` | categories in cycle ≥ 10 | 10→∞ | **RPC** `create_category` | CATEGORY_CAP_BODY |
| Category (site B: Onboarding/Settings + bulk) | `CAT01` | same, incl. `create_categories_bulk` | 10→∞ | **RPC** | CATEGORY_CAP_BODY |
| History depth | *(soft, no code)* | free user on oldest visible cycle, older hidden | 3mo→∞ | **client-only** (`visibleCycles` in useFinance); PeriodNav prev-arrow becomes upgrade affordance (`data-testid="upgrade-history-affordance"`) | HISTORY_CAP_BODY |
| Skin | `SKN01` | free user sets non-`family_warmth` skin | family_warmth→all | **RPC** `update_centre_skin` | SKIN_CAP_BODY |

> History gate is the **only non-server-enforced** cap — a UX nudge. RPC gates raise SQLSTATE codes that services map to `error.code`; UI reads it to show the right UpgradeModal copy.

---

## 7. Navigation Flows

| Surface | Element | Destination |
|---|---|---|
| **Header** (sticky) | centre name/chevron | `onOpenPanel()` → SidePanel |
| | settings gear | navigate `/settings` |
| **BottomNav** (fixed) | Home/Payday/Daily/Budget/Log | `/`, `/payday`, `/daily`, `/budget`, `/log` — Payday hidden w/o `viewIncome` |
| **FAB** | "+" | `onClick` → AddTransactionSheet (hidden on `/pricing` & w/o `log`) |
| **SidePanel** | centre row | `onSwitch(id)` → close → `/` |
| | sign out | `signOut()` |
| | install block | PWA install (Android) / instructions (iOS) |
| **HubFooter** (in SidePanel, `settings` only) | under cap | `onCreateHub` |
| | at cap (free) | UpgradeModal → close panel → `/pricing` |
| | at cap (pro) | static "Maximum N hubs reached" |
| **PeriodNav** | prev/next arrows | `onPrev`/`onNext`; locked prev → UpgradeModal (history) |
| **ArchivedHubsList** | toggle + Restore | expand; `onRestore(id)` → restore RPC + switch |

Back-button / history handled by `useModalChrome`; `/pricing` navigation dismisses chrome first to avoid history-back collisions (see recent commits c3ff9e2, abc8355).

---

## 8. External Integrations

**Supabase** (`lib/supabase.js`, anon key + user JWT)
- Auth: email/password (`signUpUser`/`signInUser`), Google OAuth, `signOut`. Session freshness via `waitForSession()` + `EXPIRY_SKEW_S=30` auto-refresh; `onAuthStateChange` (SIGNED_IN / TOKEN_REFRESHED / SIGNED_OUT) in `useAuth`.
- Tables: `users`, `budget_centres`, `budget_centre_members`, `centre_invites`, `budget_categories`, `budget_cycles`, `transactions`, `income_sources`, `guest_users`, `subscriptions`. RLS is the primary access control.
- RPCs: `create_hub`, `create_invite`, `accept_invite`, `create_category`, `create_categories_bulk`, `create_budget_period`, `reset_budget_period`, `update_centre_skin`, `submit_guest_transaction`, `authenticate_guest`, `apply_subscription_event` (service_role only).

**Paystack** (cedis only)
- Checkout: `PricingView` → `checkout.service.startCheckout(interval)` → POST `/api/paystack/checkout` (Vercel). Server validates JWT, resolves plan code, calls `transaction/initialize`, returns `authorization_url`; client redirects. Callback → `/pricing?checkout=return`; PricingView polls `subscription.refresh()` ~2s for ~30s.
- Webhook: `/api/paystack/webhook.js` verifies HMAC-SHA512, handles `charge.success` / `subscription.create` / `subscription.disable` / `invoice.payment_failed`, calls `apply_subscription_event` RPC (service_role). Always 200 on valid signature.
- Pricing (`lib/pricing.js`): GHS, monthly ₵40 (4000 pesewas), annual ₵400 (40000), ~17% saving.

**PWA:** `lib/pwa.js` captures `beforeinstallprompt`; `triggerInstall()` shows OS dialog; manifest + service worker registered in `main.jsx`.

---

## 9. Data Types (writeable entities)

> Field names **inferred from code** — verify against migrations in Phase 2.

| Entity | Table | Key fields (inferred) | Write access | Soft delete |
|---|---|---|---|---|
| Hub | `budget_centres` | id, **owner_id**, name, icon, currency, type, surplus_target, skin_id, is_archived | create owner (HUB01); update owner/full_access; skin SKN01; delete/restore owner | ✅ |
| Member | `budget_centre_members` | id, budget_centre_id, user_id, role, joined_at | created via hub/accept_invite; role+remove **owner-only** (owner-guarded) | ✅ |
| Invite | `centre_invites` | id, budget_centre_id, invited_email, invited_by, role, token, status, expires_at | create owner/manageMembers (MEM01); cancel owner; accept via token | ✅ |
| Category | `budget_categories` | id, budget_centre_id, month, cycle_id, name, icon, budget_amount, is_fixed, sort_order | create/update/delete any member (CAT01 on create) | ✅ |
| Transaction | `transactions` | id, budget_centre_id, cycle_id, date, week, type, category_name, category_id, amount, currency, description, logged_by_*, source, from_spare, income_source_id | create w/ `log` or guest RPC; update/move/delete any member | ✅ |
| Income source | `income_sources` | id, budget_centre_id, month, cycle_id, label, icon, expected_amount, currency, pay_day, pay_day_type, notes, received_amount, actual_pay_date | create w/ `logIncome`; update/markReceived/markPending/delete | ✅ |
| Budget cycle | `budget_cycles` | id, budget_centre_id, start_date, end_date, cycle_type, is_active | create/reset owner/full_access (`manageCycles`) | ✅ |
| Guest | `guest_users` | id, budget_centre_id, name, pin_hash, allowed_categories, is_active | create/update/toggle/delete owner/full_access | ✅ |
| Subscription | `subscriptions` | id, user_id, tier, status, current_period_start/end, payment ref | **server-only** (Paystack webhook RPC); client read-only | ✅ |
| PIN | `users.pin_hash` | pin_hash (SHA-256 hex) | self only (hashed client-side) | n/a |

**Tier resolution** (`subscriptions`): no row / non-active / expired `current_period_end` → free; active + future end → that tier.

---

## Open questions for Phase 1 / Phase 2

1. **DB field confirmation** — Section 9 fields are code-inferred; reconcile against `scripts/*.sql` migrations (esp. `transactions.source` enum, `cycle_type` values, `received_date` vs `actual_pay_date`).
2. **Transaction update path** — one reader claimed updates "delete+recreate", another `updateTransaction` exists in the service. Confirm actual edit behavior (LogView `onEditTx` → AddTransactionSheet suggests in-place update).
3. **History gate is client-only** — the single cap with no server enforcement; flag as a deliberate UX nudge (not a privacy boundary) in the journey map.
4. **Guest portal** is a fully separate auth surface (`/` guest path? confirm entry URL) — needs its own Stage-1 smoke lane.
