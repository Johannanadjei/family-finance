# Phase 1 — Stage 1 Test Coverage Map

**Scope:** Stage 1 = **broad + shallow** UI smoke + visual regression. NOT the deep functional journey map (Stage 2, deferred — needs dedicated test Supabase, memory #25 Phase 2).
**Derived from:** [`phase-0a-inventory.md`](./phase-0a-inventory.md) — §1–§9 refs below point at that doc.
**Status:** Read-only design. No code yet. **All open questions resolved** — see *Decisions locked* below.

---

## Decisions locked (all resolved)

| # | Decision | Resolution |
|---|---|---|
| **Write strategy** | How Stage 1 avoids polluting the shared prod DB | **Option A — stop-before-submit** + an abort-and-fail-loud Playwright network rail (§0). Drive UI to the pre-write state; never click terminal Save/Confirm; aborted writes fail the test. |
| **Q5 — cap/skin read-state** | How to reach at-cap / Pro states without writing | **Path A** — **6** manually-seeded, read-only fixture accounts (§0.1), created once by hand outside the suite. |
| **Test logins** (folded into Q5) | Which accounts authed runs use | The §0.1 fixtures *are* the accounts: owner via `pro`, standard via `mem-cap`'s 2nd member, free via `fresh`/`cat-cap`/`hub-cap`. Sign-out asserted **present-but-not-clicked** (session write). |
| **data-testid → Phase 2.5** | Selector PR scope | Scoped by the **§2 (CTA) + §4 (cap)** tables in this doc. |
| **Q1 — Vitest vs Playwright** | Avoid duplicate coverage | **Gap-fill only.** Vitest stays the unit layer (~50 `*.test.jsx`); Playwright layers on top for what Vitest can't reach — real routing, real context, full-app integration, visual regression, forced-state screens. No re-covering component tests at integration level. |
| **Q2 — AccessBlocked copy** | §3 copy source of truth | **Not centralized** (grep-confirmed). First line = **per-view literal** via `message` prop at 3 live sites; second line `"Contact your hub owner to request access."` = **hardcoded in `AccessBlocked.jsx`**; default fallback `"You don't have access to this section."`. Detail in §3. |
| **Q3 — GuestPortal entry** | How GuestPortal is reached | **Query param, not a route** (grep-confirmed): `main.jsx` selects it pre-React when `?guest=1`, full URL `…/?guest=1&c={centreId}&cur={currency}`. Separate lazy entry + anon Supabase client; `/join` takes precedence. |
| **Q4 — visual diff tooling** | Baseline storage / CI | **Playwright `toHaveScreenshot`, baselines committed in-repo.** Zero-cost, version-controlled, offline. Revisit only if cross-env flake bites. |
| **HUB01 fixture tension** | `fresh` (0 hubs) ≠ at-cap read-state | **Resolved** — added **6th fixture `stage1-fixture-hub-cap`** (exactly 1 hub) for the at-cap affordance; `fresh` stays at zero hubs for the from-zero/onboarding render. |

---

## 0. Governing decision — Option A: stop-before-submit

There is **one** Supabase project (`oxpwgpugvucsqnzixafi`) shared across dev / staging / main (memory #5). **Local `npm run dev` writes hit production data.** There is no "dev data" to dirty — it is all live. Therefore Stage 1 is locked to **Option A: stop-before-submit**, backed by a hard network safety net.

**The rule:** Stage 1 drives the UI right up to — but never through — any state-changing action.

| Do | Don't |
|---|---|
| Open modals → verify content | Click destructive actions (Delete Forever, Remove, Reset) |
| Fill forms → verify validation / button enabled-disabled | Click final Save / Submit / Confirm |
| Click "Upgrade to Pro" → verify it **navigates** to `/pricing` | Proceed into Paystack / actually pay |
| Trigger a cap → verify the UpgradeModal **opens** | Chase the upgrade/checkout flow past the modal |
| Tap any button → assert the UI state change | Let any write reach the DB |

**Why a safety net on top of discipline:** stop-before-submit is a *convention*; conventions get violated by a misclicked selector or a refactor. So we add a network kill-switch that makes an accidental write **impossible and loud** rather than silent.

### Network safety rails (the interception design)

Playwright `route()` installed in a shared fixture, before every Stage 1 test:

- **Block every mutating request** to Supabase: any `POST` / `PATCH` / `PUT` / `DELETE` to `**/rest/v1/**` and **all** `**/rest/v1/rpc/**` (RPCs are POST but state-changing).
- **Block** `POST **/api/paystack/checkout`.
- On match → `route.abort()` with a tagged reason (`"blocked: Stage 1 safety"`) **and** push the URL+method onto a per-test `violations[]` array.
- **`GET`** to `rest/v1` (reads) and `GET`/static for `/pricing` pass through untouched.
- **Fail loudly:** an `afterEach` asserts `violations` is empty. Any captured write attempt **fails that test** with the offending URL — a triggered write is a test bug, surfaced immediately, never a silent prod mutation.

```
// design intent (not final code)
await page.route('**/rest/v1/**', (route) => {
  const r = route.request();
  if (r.method() !== 'GET') { violations.push(`${r.method()} ${r.url()}`); return route.abort('failed'); }
  return route.continue();
});
await page.route('**/rest/v1/rpc/**', (route) => { violations.push(...); route.abort('failed'); });
await page.route('**/api/paystack/checkout', (route) => { violations.push(...); route.abort('failed'); });
// afterEach: expect(violations, `Stage 1 write attempt(s): ${violations}`).toHaveLength(0);
```

> Note vs Option B: we are **not** stubbing fake success responses. Writes are *aborted*, not faked. So Stage 1 never observes post-write UI; it observes only pre-write UI + the navigation/modal layer. That boundary is exactly what defers to Stage 2.

### Environment routing
| Target | Use for | Why |
|---|---|---|
| Production `/pricing` (chrome-less) | render + copy + visual of PricingView | Safe GET, no auth wall, no chrome |
| Local `npm run dev` (+ read-only test login) | all authed routes/views/modals | Full DOM control; **all writes aborted by the rail** |
| ~~Vercel dev preview~~ | AVOID | Auth wall blocks AI-agent navigation |

---

## 0.1 Fixture accounts (Q5 — LOCKED: Path A, manual one-time seed)

Stage 1 cap-gate and Pro-skin coverage needs accounts that **already sit at the relevant state** so the UI can be *read* (no write to reach the state). Per the Q5 decision, we seed **6 fixture accounts once, manually, via the UI**, then treat them as immutable read-only fixtures.

- **Email pattern:** `stage1-fixture-{condition}@bos-test.com`
- **One-time creation only.** After seeding, these accounts **MUST NOT be touched manually** — any manual login/edit corrupts the baseline. (To be recorded in memory + a `docs/qa/fixture-accounts.md` register, and flagged in `plans.js` / fixtures as read-only test fixtures.)
- The seeding writes are the **single sanctioned exception** to "no writes" — they happen **outside the test suite**, by hand, before Stage 1 runs. The suite itself still never writes.

| Fixture email | Seeded state | Covers | Role |
|---|---|---|---|
| `stage1-fixture-fresh@bos-test.com` | brand new, **no hubs** | HUB01 from-zero / onboarding render | owner (free) |
| `stage1-fixture-hub-cap@bos-test.com` | **exactly 1 hub** (free cap) | **HUB01 at-cap** HubFooter affordance | owner (free) |
| `stage1-fixture-cat-cap@bos-test.com` | 1 hub, **10 categories** in a cycle | CAT01 affordance (BudgetView + Settings) | owner (free) |
| `stage1-fixture-mem-cap@bos-test.com` | 1 hub, **2 members** (2nd = `standard` role) | MEM01 affordance · **standard-role AccessBlocked variants** | owner (free) + standard |
| `stage1-fixture-pro@bos-test.com` | **Pro subscription**, multiple hubs + categories | Pro state · Pro-skin visual baselines · Pro-side cap absence | owner (Pro) |
| `stage1-fixture-history@bos-test.com` | **4+ cycles** of history, free tier | history wall affordance | owner (free) |

> `fresh` (0 hubs) and `hub-cap` (1 hub) are deliberately separate: `fresh` renders the onboarding/from-zero path, `hub-cap` renders the at-cap HubFooter without either fixture mutating. SKN01 needs no special seed — any free fixture renders ThemeSection with locked Pro chips. The `pro` fixture doubles as the owner-baseline + Pro-skin source. The `mem-cap` fixture's 2nd member supplies the **standard-role** session for §1/§5 role variants.

---

## What Stage 1 covers vs defers (honest summary)

**Covered:** all rendering · all read paths · all UI state transitions (open/close/expand/toggle) · all navigation · copy regression · visual regression · cap-gate **trigger thresholds** (the modal opens) — but not what happens after you click Upgrade.

**NOT covered → Stage 2:** actual writes/mutations · post-write/optimistic UI & rollback · server-side cap rejection (SQLSTATE path) · webhook flows · Paystack hosted checkout · DB state after any action · multi-step journeys with real data.

---

## 1. Render Coverage — "renders without error"

One smoke assertion per surface: mounts, no thrown error, no ErrorBoundary, key landmark visible. **All read-only — fully safe under Option A.**

### Routes & gates (§1, §2)
| Surface | Phase 0A ref | Env | Setup | Notes |
|---|---|---|---|---|
| `/` HomeView | §1,§2 | local | authed owner, ≥1 hub | role baseline |
| `/payday` | §1,§2 | local | authed owner | + standard→AccessBlocked variant |
| `/daily` | §1,§2 | local | authed | |
| `/budget` | §1,§2 | local | authed | |
| `/log` | §1,§2 | local | authed | |
| `/settings` | §1,§2 | local | authed owner | + standard→AccessBlocked variant |
| `/pricing` | §1,§2 | **prod** + local | signed-in | chrome-less |
| `/join` | §1 | local | unauth + token param | gate-bypass path |
| AuthScreen | §1,§2 | local | signed-out | |
| PinScreen / PinSetupFlow | §1,§2 | local | PIN gate states | |
| GuestPortal | §1,§2 | local | URL `?guest=1&c={centreId}&cur={currency}` (Q3 resolved) | separate lazy entry + anon client; `/join` precedes it |
| OnboardingFlow (each step) | §1 | local | `needsOnboarding` (via `fresh`) | render only — no step submit |
| Removed/Error/Loading screens | §1 | local | forced state | may need state stub to reach (Vitest may already cover — Q1 gap-fill) |

### Modals / sheets — render-on-open (§3)
Open via trigger, assert present, then dismiss. 19 overlays: UpgradeModal, ConfirmModal, Toast, InstallPrompt, AccessBlocked, CreateHubSheet, AddCategorySheet, CopyCategoriesSheet, CreateBudgetPeriodSheet, AddTransactionSheet, MoveCycleSheet, ConfirmSheet, CopyIncomeSheet, UpdateReceivedSheet, AddGuestSheet, ArchiveHubSheet, SidePanel (+ host wrappers BudgetSheets / PaydaySheets). Opening is safe; only the terminal Save/Confirm is withheld.

---

## 2. CTA Coverage — with stop-before-submit annotation per CTA

Each CTA tagged with how far Stage 1 drives it.

**Legend:** ✅ **FULL** = runs end-to-end safely · 🟡 **PARTIAL** = drive to pre-submit state, stop · ⛔ **OPEN-ONLY** = open modal/confirm, never click through · ➡️ **NAV** = assert navigation only.

### Navigation & chrome (§7) — ✅ FULL / ➡️ NAV
| CTA | ref | Stage 1 asserts |
|---|---|---|
| Header gear → `/settings` | §7 | ➡️ route change |
| Header name → SidePanel | §7 | ✅ panel opens |
| BottomNav 5 tabs | §7 | ➡️ route change; Payday hidden w/o `viewIncome` |
| FAB → AddTransactionSheet | §7 | ✅ sheet opens (hidden on `/pricing`, w/o `log`) |
| SidePanel centre row | §7 | ✅ switch + ➡️ navigate `/` |
| SidePanel sign out | §7 | 🟡 **assert button present only** — signing out is a session write; do not click |
| PeriodNav prev/next | §7 | ✅ label changes (read) |
| ArchivedHubsList toggle | §7 | ✅ expand/collapse |
| HubFooter "+ New BOS Hub" | §7 | ✅ CreateHubSheet opens |
| Every sheet Cancel / × / Esc / back | §3 | ✅ dismiss |

### Upgrade / pricing (§3,§6,§7) — ➡️ NAV (stops at /pricing)
| CTA | ref | Stage 1 asserts |
|---|---|---|
| HubFooter upgrade → UpgradeModal → `/pricing` | §3,§7 | ⛔ modal opens → ➡️ navigates `/pricing` (chrome dismissed first); **stop** |
| UpgradeModal "Upgrade to Pro" | §3 | ➡️ route `/pricing`; **stop** |
| UpgradeModal "Got it" / backdrop / Esc | §3 | ✅ dismiss |
| PricingView billing toggle | §2 | ✅ price+period swap (read) |
| PricingView plan/Upgrade CTA → `startCheckout` | §8 | ⛔ **assert click handler reachable; rail blocks the `POST /api/paystack/checkout`; never redirect to Paystack** |

### Write CTAs (§4) — 🟡 PARTIAL (drive to pre-submit, never Save)
For each: fill inputs, assert validation messages, assert Save enabled/disabled toggles correctly — **do not click Save/Confirm**. The terminal button + its mutation = Stage 2.

AddTransactionSheet (expense+income tab toggle, category select, date validation) · AddCategorySheet (name required) · CopyCategoriesSheet (select-all) · CreateBudgetPeriodSheet (choose/custom, date validation) · ConfirmSheet (amount prefill) · CopyIncomeSheet · UpdateReceivedSheet · MembersSection invite (email/role inputs) · AddGuestSheet (PIN match validation) · CentreSettingsSection (inline edit enable) · CreateHubSheet (step nav: Type→Name→Categories→Income→Confirm — traverse steps, **stop at "Create Hub 🎉"**) · GuestTransactionForm · PinSetupFlow (PIN entry + mismatch).

### Destructive CTAs (§3,§5) — ⛔ OPEN-ONLY
Open the confirm UI, assert its warning copy + that the destructive button exists — **never click**.

ArchiveHubSheet Archive / "Delete Forever" (+ name-match gating disabled state) · MemberRow remove / role change · ConfirmModal Continue (danger tone) · category delete · income source delete · BudgetPeriodCreator reset.

---

## 3. Copy Coverage — visible strings vs source of truth

Rendered text == canonical constant. **Read-only — fully safe.**

| Copy set | Source of truth | Rendered in | ref |
|---|---|---|---|
| Plan limits / feature names | `lib/plans.js` (FREE/PRO_LIMITS) | PricingView, PlanSection, gate modals | §6 |
| Price / period / savings | `lib/pricing.js` (GHS ₵40 / ₵400 / ~17%) | PricingView, gate modal footers | §6,§8 |
| Upgrade modal bodies | `lib/planCopy.js` (DEFAULT/MEMBER/CATEGORY/HISTORY/SKIN _CAP_BODY) | UpgradeModal per gate | §6 |
| Role labels / descriptions | `lib/roles.js` (ROLE_LABELS, ROLE_DESCRIPTIONS) | MembersSection, MemberRow, invite | §5 |
| AccessBlocked messages | **split** — see note below (Q2 resolved) | payday/settings/log blocked | §3,§5 |
| Currency symbols | `lib/currencies.js` | all `fmt()` output | §9 |
| Brand / wordmark | LoadingScreen "Money B.O.S", BrandLockup | splash, join | §1 |
| Empty-state strings | view literals | BudgetEmptyState, MonthEmptyState, NoIncomeSourcesEmpty, RecentActivity | §2 |
| Onboarding step copy | `onboarding.constants.js` | OnboardingFlow steps | §1 |

> Assert UI shows **"BOS Hub" / "Hub"**, never "centre" (intentional DB↔UI split, CLAUDE.md).

> **AccessBlocked copy source (Q2 — grep-confirmed, NOT centralized).** `src/components/ui/AccessBlocked.jsx` renders `{message}` (a prop) + a **hardcoded** second line `"Contact your hub owner to request access."`, with default prop `"You don't have access to this section."`. The first line is a **per-view literal** passed at 3 live render sites:
> - `LogView.jsx:62` (`!can('log')`) → `"The transaction log is not available for your role."`
> - `PaydayView.jsx:57` (`!can('viewIncome')`) → `"Income tracking is only available to hub owners and full-access members."`
> - `SettingsView.jsx:38` (`!can('settings')`) → `"Settings are only available to hub owners and full-access members."`
>
> Copy tests assert each per-view literal at its site + the shared hardcoded second line. (`HomeView` and `AddTransactionSheet` import `AccessBlocked` but do **not** render it — those imports are inert; not test targets.) The component already exposes `data-testid="access-blocked"`.

---

## 4. Cap Gate Coverage — modal-open verification only

**Honesty note.** Under Option A we do **not** fake state. To sit *at* a threshold, the test account must **already hold that state as read-only data** (viewing existing rows = no write) — supplied by the §0.1 fixture accounts. Given that, Stage 1 verifies the **client-side affordance / modal-open**, which fires from a client count check *before* any write. The **server SQLSTATE rejection** (HUB01/MEM01/CAT01/SKN01 raised by the RPC) requires an actual write attempt → blocked by the rail → **Stage 2**.

| Gate | Code | Fixture account (§0.1) | Surface | Stage 1 asserts | ref | Stage 2 |
|---|---|---|---|---|---|---|
| Hub | `HUB01` | **`stage1-fixture-hub-cap`** (1 hub) | HubFooter at-cap | ⛔ "Upgrade to add more hubs" → UpgradeModal **DEFAULT_BODY** opens | §6 | RPC reject on create #2 |
| Member | `MEM01` | `stage1-fixture-mem-cap` (2 members) | MembersSection | counter "2 of 2" + invite disabled/affordance → **MEMBER_CAP_BODY** | §6 | RPC reject on invite #3 |
| Category | `CAT01` | `stage1-fixture-cat-cap` (10 categories) | BudgetView / AddCategorySheet | "N of 10" + add tap → **CATEGORY_CAP_BODY** | §6 | RPC reject on add #11 (+ bulk path) |
| Skin | `SKN01` | any free fixture (`fresh` / `cat-cap`) | ThemeSection locked chip | tap locked chip → **SKIN_CAP_BODY** (modal, no nav) | §6 | RPC reject on skin write |
| History | *(soft)* | `stage1-fixture-history` (≥4 cycles, free) | PeriodNav prev arrow `data-testid="upgrade-history-affordance"` | affordance present → **HISTORY_CAP_BODY** → ➡️ `/pricing` | §6 | n/a (client-only gate — fully testable from this fixture) |

> History is the only gate with **no** server SQLSTATE — so once a 4+ cycle free account exists, it is fully coverable in Stage 1. The other four are **half-covered** in Stage 1 (affordance/modal) and **completed** in Stage 2 (server rejection).

---

## 5. Visual Regression Baselines — per route + skin

First approved screenshot = baseline; runs diff against it. Capture at **390px** (note 440px max-width container). **Read-only — safe.**

### Per-route (owner baseline, family_warmth)
Source fixture: `stage1-fixture-pro` or `stage1-fixture-cat-cap` (any populated owner) for content-rich shots; `stage1-fixture-fresh` for empty-state shots.
`/` · `/payday` · `/daily` · `/budget` · `/log` · `/settings` · `/pricing` (monthly **+** annual) · AuthScreen · PinScreen · OnboardingFlow (each step, via `fresh`) · GuestPortal.

### Per-modal (opened state)
UpgradeModal ×5 gate bodies (sourced from the matching cap fixtures, §0.1/§4) · CreateHubSheet (each step) · AddTransactionSheet (expense + income tabs) · AddCategorySheet · ConfirmSheet · AddGuestSheet · ArchiveHubSheet (archive + delete steps) · SidePanel (open) · AccessBlocked.

### Per-skin (§6)
| Skin | Tier | Fixture | Scope |
|---|---|---|---|
| `family_warmth` | free | any free fixture | full route set (default baseline) |
| every other skin in `lib/themes.js` | **Pro** | **`stage1-fixture-pro`** | ≥ `/` + `/settings` ThemeSection per skin. Pro state is pre-seeded once in this fixture (Q5 Path A) — the suite never writes the `subscriptions` row. |

### Role variants
owner (from `stage1-fixture-pro`) vs **standard** (the 2nd member on `stage1-fixture-mem-cap`): FAB hidden, Payday/Settings/Log AccessBlocked, income/balance hidden — at least `/` + `/payday` + `/settings`.

---

## 6. Safety Rails — must NEVER do (enforced by §0 rail)

1. **No Supabase writes** — every non-GET to `rest/v1` + all `rpc/*` aborted; shared DB makes this absolute.
2. **No Paystack calls** — `POST /api/paystack/checkout` aborted; never reach `api.paystack.co`; no webhook simulation.
3. **No real users** — AuthScreen sign-up never submitted; use pre-provisioned read-only logins.
4. **No PIN / guest mutations** — `savePinHash`, `createGuestUser`, `submit_guest_transaction` are writes → aborted.
5. **No destructive nav** — never click Delete Forever / Remove / Reset / category-delete against live data.
6. **Production = read-only** — production touched only for `/pricing` GET render + visual.
7. **Fail closed** — `afterEach` asserts zero captured write attempts; any escape fails the test loudly with URL+method.
8. **No faked success** — the rail *aborts*, never stubs 200s; Stage 1 must not assert post-write UI (that's a Stage 2 tell that a test overreached).

---

## 7. Stage 2 Pre-requisites — what we defer & what unblocks it

Everything below is explicitly **out of Stage 1** and gated on infrastructure that doesn't exist yet.

### Deferred coverage (the "NOT covered" list, formalized)
- Actual writes/mutations across all §4 service functions + post-write optimistic UI & rollback (CLAUDE.md §5 pattern).
- Server-side cap rejection: HUB01/MEM01/CAT01/SKN01 SQLSTATE paths + service→`error.code`→modal mapping.
- Two-phase `markReceived` (income source + income txn) integrity.
- Paystack hosted checkout + return polling + the full webhook → `apply_subscription_event` → tier flip.
- Guest portal end-to-end (`authenticate_guest` + `submit_guest_transaction`).
- Invite acceptance (`accept_invite`) + member lifecycle.
- DB state assertions after any action; multi-step journeys with real data (the deep journey map).

### Conditions Stage 2 needs before it can start
1. **Dedicated test Supabase project** (memory #25 Phase 2) — separate from `oxpwgpugvucsqnzixafi` so writes are safe. This is the keystone; nothing in Stage 2 starts without it.
2. **Seeded users per role — programmatic.** Stage 1 uses the §0.1 fixtures seeded **manually, once, by hand** (Q5 Path A) and read-only. Stage 2 needs the same role/state matrix (owner / full_access / standard / guest + Pro + free + at-cap states) seeded **programmatically and resettable** in the dedicated test project, so write tests can mutate and reset freely. The §0.1 fixtures are the Stage 1 stopgap, not the Stage 2 solution.
3. **Reset tooling** — idempotent teardown/reseed between runs (truncate + reseed script against the test project) so suites are repeatable.
4. **Paystack test mode** — test secret key + test plan codes + a way to drive sandbox checkout and replay signed test webhooks to the webhook endpoint.
5. **RLS parity** — test project must mirror prod RLS policies + all RPCs (`create_hub`, `create_invite`, `accept_invite`, `create_category`/`_bulk`, `create_budget_period`, `reset_budget_period`, `update_centre_skin`, `submit_guest_transaction`, `authenticate_guest`, `apply_subscription_event`), or coverage is meaningless.
6. **data-testid coverage** (Phase 2.5) — stable selectors for every CTA + cap surface, scoped by **this map's §2/§4 tables**.

---

## Resolution log — all questions closed

| Item | Status | Where resolved |
|---|---|---|
| Write strategy (Option A) | ✅ locked | §0 + top summary |
| Q1 — Vitest vs Playwright boundary | ✅ gap-fill only | top summary |
| Q2 — AccessBlocked copy source | ✅ per-view literals + hardcoded line (grep-confirmed) | §3 note + top summary |
| Q3 — GuestPortal entry URL | ✅ `?guest=1&c=&cur=` query param (grep-confirmed) | §1 + top summary |
| Q4 — Visual diff tooling | ✅ Playwright `toHaveScreenshot`, in-repo baselines | top summary |
| Q5 — cap/skin read-state | ✅ Path A, 6 manual read-only fixtures | §0.1 + top summary |
| Test logins (folded into Q5) | ✅ fixtures are the accounts | top summary |
| data-testid → Phase 2.5 scope | ✅ scoped by §2 + §4 tables | top summary |
| HUB01 fixture tension | ✅ added 6th fixture `stage1-fixture-hub-cap` | §0.1 + §4 |

**No open questions remain.** Next: Phase 2.5 (data-testid PR scoped by §2/§4) → Phase 3 (Playwright + visual baselines) → Stage 2 once a dedicated test Supabase exists (§7).
