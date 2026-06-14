# Phase 2.5 — `data-testid` Coverage Audit

**Scope:** audit current `data-testid` coverage in `src/` against the selector requirements in
[`phase-1-stage-1-coverage.md`](./phase-1-stage-1-coverage.md) **§2 (CTA Coverage)** and **§4 (Cap Gate
Coverage)**, identify gaps, and produce an implementation plan.

**Status:** Read-only design. **No `data-testid` added yet.** Review this before implementation.

**Method:** `grep -rn "data-testid" src/ --include="*.jsx" --include="*.js"` (excluding `*.test.*`),
cross-referenced against the §2/§4 tables. Counts below are **code-sites** (a templated
`` data-testid={`x-${id}`} `` counts once, as one selector pattern).

---

## Decisions locked (approved 2026-06-14)

| # | Decision | Resolution |
|---|---|---|
| **D1** | Naming convention | **KEEP** the existing noun-first, suffix-typed convention (`-btn`/`-cta`/`-input`/`-sheet`/`` -${id} ``). **Reject** the `cta-*`/`form-*`/`modal-*` prefix scheme. Cap-gate modals → `upgrade-modal-{gate}`, mirroring the existing `upgrade-{gate}-btn`. |
| **D2** | UpgradeModal pattern | **Option A — `testid` prop passed by consumer.** Each of the 6 call sites passes its own value: `upgrade-modal-hub`, `upgrade-modal-member`, **`upgrade-modal-category-budget`**, **`upgrade-modal-category-settings`**, `upgrade-modal-skin`, `upgrade-modal-history`. The two CAT01 surfaces (BudgetView vs SettingsView) get **distinct** testids. No coupling of `planCopy.js` to test infrastructure. CTA button derives as `` ${testid}-cta ``. |
| **D3** | `centre-*` testids | **Do not rename.** Internal test hooks, not user-facing (memory #8). |
| **D4** | PaydayHeader duplicate testid | **Separate cleanup** — logged in §7 Backlog below, NOT bundled with Phase 2.5. |

---

## 0. Headline finding

Almost all **forms, sheets, destructive confirms, and PricingView** CTAs are already covered — the
existing suite of **~224 testid code-sites across 51 files** is broad. The gaps cluster in exactly
two areas the §2/§4 tables depend on:

1. **`UpgradeModal` has zero testids** — yet it is the assertion target of **all five §4 cap-gate
   rows** (it opens with a different `body` per gate from 6 render sites). This is the single
   highest-leverage gap.
2. **App chrome** — `Header`, `BottomNav`, `FAB`, the `SidePanel` hub-switch row, the `HubFooter`
   buttons, and the entire **`CreateHubSheet`** 5-step flow carry no testids. These are the §2
   navigation + write-CTA targets.

Everything else in §2/§4 is either already covered or a minor/optional nicety.

---

## 1. Existing coverage (Phase 1 of the audit)

Full inventory is reproducible via the grep above. Categorized by purpose:

### CTAs / buttons (`*-btn`, `*-cta`)
| testid | file:line | purpose |
|---|---|---|
| `upgrade-cta` | PricingView.jsx:80 | Pro upgrade → `startCheckout` |
| `manage-sub` | PricingView.jsx:180 | manage subscription |
| `plan-cta` | PlanSection.jsx:32 | settings plan CTA |
| `add-category-btn` | SettingsView.jsx:77 | add category (settings) |
| `upgrade-categories-btn` | SettingsView.jsx:72, BudgetCategoryList.jsx:89 | CAT01 affordance (2 surfaces) |
| `upgrade-members-btn` | MembersSection.jsx:146 | MEM01 affordance |
| `add-category-btn` / `onboarding-add-category-btn` | BudgetEmptyState/StepCategories | add category (other surfaces) |
| `invite-member-btn`, `send-invite-btn` | MembersSection.jsx:182,175 | invite open + send |
| `new-period-btn`, `period-actions-btn`, `reset-period-btn` | BudgetHeader.jsx:50,58,66 | period actions |
| `create-period-cta` | NoCurrentPeriodPrompt.jsx:35 | create period (empty state) |
| `archive-hub-btn`, `archive-confirm-btn`, `delete-forever-btn`, `delete-back-btn`, `archive-delete-link` | CentreSettingsSection / ArchiveHubSheet | archive/delete flow |
| `setup-pin-btn`, `change-pin-btn`, `remove-pin-btn` | SecuritySection.jsx:110,119,126 | PIN actions |
| `add-guest-btn`, `add-guest-save-btn`, `copy-link-btn` | GuestSettingsSection / AddGuestSheet | guest actions |
| `add-income-source-btn`, `save-income-source-btn` | IncomeSourcesSection.jsx:84,127 | income source add |
| `copy-*-btn` family (`copy-all-btn`, `choose-which-btn`, `add-manually-btn`, `copy-categories-*-btn`, `copy-selected-btn`, `copy-cancel-btn`) | BudgetEmptyState / NoIncomeSourcesEmpty / CopyCategoriesSheet / CopyIncomeSheet | copy/seed flows |
| `move-confirm-btn`, `move-cancel-btn` | MoveCycleSheet.jsx:124,111 | move cycle |
| `period-save-btn`, `period-cancel-btn`, `period-close-btn`, `quick-next-month-btn`, `custom-period-btn` | CreateBudgetPeriodSheet | period sheet |
| `confirm-join-btn` | JoinView.jsx:180 | invite accept |
| `forgot-pin-btn`, `forgot-pin-confirm-btn`, `pin-setup-skip` | PinScreen / PinSetupFlow | PIN nav |
| `guest-enter-btn`, `guest-save-btn` | GuestPinScreen / GuestTransactionForm | guest portal |
| `settings-install-btn`, `install-prompt-install`, `install-prompt-dismiss` | InstallAppSection / InstallBanners | PWA install |
| `centre-edit-btn`, `centre-save-btn` | CentreSettingsSection.jsx:53,91 | hub settings inline edit |
| `side-panel-sign-out` | SidePanel.jsx:176 | sign out (assert-present-only per §2) |
| `archived-section-toggle` | ArchivedHubsList.jsx:19 | archived hubs expand |

### Forms / inputs (`*-input`, `*-select`, `*-toggle`)
`surplus-input`, `add-cat-name-input`, `add-cat-amount-input`, `add-amount-input`, `add-category-input`,
`add-date-input`/`add-month-input`/`add-year-input`, `period-name-input`, `copy-prev-toggle`,
`from-spare-toggle`, `invite-email-input`, `invite-role-select`, `centre-name-input`,
`centre-currency-select`, `new-source-label`/`-amount`/`-pay-day-type`/`-pay-day`/`-month`,
`add-guest-name`/`-pin`/`-confirm-pin`, `delete-name-input`, `confirm-amount-input`,
`confirm-date-day`/`-month`/`-year`, `guest-amount-input`/`-description-input`/`-date-*`,
`guest-pin-input`, `log-search-input`. **Forms are well covered.**

### Containers / sheets / screens
`access-blocked`, `pin-screen`, `pin-setup-flow`, `security-section`, `pricing-skeleton`,
`copy-categories-sheet`, `create-period-sheet`, `move-cycle-sheet`, `copy-income-sheet`,
`archive-hub-dialog`, `no-current-period-prompt`, `install-prompt`, `update-received-backdrop`,
`past-income-card`, `move-cycle-empty`.

### State indicators / values
`plan-tier`, `member-count`, `category-count` (SettingsView + BudgetCategoryList), `total-income`,
`total-budgeted`, `suggested-surplus`, `home-month-label`, `daily-total-spent`,
`budget-total-planned`/`-spent`, `payday-total-received`/`-pending`, `income-received-amount`,
`subscription-error`, `cta-error`, `pin-error-message`, `lockout-message`, `pin-mismatch-msg`,
`guest-form-error`, `guest-load-error`, `guest-success-msg`, `currency-relabel-warning`,
`archive-blocked-msg`, `portal-link`/`portal-link-label`, `pin-dots`.

### Templated per-row patterns (dynamic, one site each)
`toggle-${key}`, `plan-${key}`, `current-${key}` (PricingView) · `theme-${s.key}` (ThemeSection) ·
`cat-{name,budget,edit,delete,delete-confirm,delete-cancel,icon-toggle,name-input,budget-input,save}-${cat.id}`
(CategorySettingsRow) · `budget-{spent,bar,remaining}-${id}` (CategoryBudgetRow) ·
`copy-category-${id}`, `copy-source-${id}` · `tx-{amount,delete,menu,move}-${id}` (TransactionRow) ·
`guest-{row,toggle,edit,delete,delete-confirm,cat,btn,cat-check}-${id}` · `restore-hub-${id}` ·
`log-filter-${key}` · `confirm/cancel/remove-member-${id}` (MemberRow) · `cancel-invite-${id}` ·
`edit-*-${income.id}`, `income-*-${source.id}` (IncomeCard / IncomeSourceRow) · `theme-${key}` ·
`income-month-{group,header}-${month}` · `week-tab-${w.week}` · `move-cycle-option-${id}` ·
`received-update-{prompt,confirm,keep}-${sourceId}` · `${testid}-{day,month,year}` (CreateBudgetPeriodSheet,
MonthlyIncomeCard `${testId}-card`).

> **Already present and §4-relevant:** `upgrade-history-affordance` (PeriodNav.jsx:38, conditional on
> `historyLocked`) — the **only** cap gate already wired end-to-end. `data-testid="access-blocked"`
> (AccessBlocked.jsx:11) — covers all §3 AccessBlocked variants.

---

## 2. Required coverage per §2 + §4

### §2 — CTA Coverage

| § | CTA | Component | Element | Has testid? | Proposed testid |
|---|---|---|---|---|---|
| Nav | Header gear → `/settings` | Header.jsx:71 | button | ❌ | `header-settings-btn` |
| Nav | Header name → SidePanel | Header.jsx:33 | button | ❌ | `header-hub-switcher-btn` |
| Nav | BottomNav 5 tabs | BottomNav.jsx:49 | button (×5, mapped) | ❌ | `` nav-tab-${tab.key} `` |
| Nav | FAB → AddTransactionSheet | FAB.jsx:13 | button | ❌ | `fab-add-transaction` |
| Nav | SidePanel hub row → switch | SidePanel.jsx:96 | button (mapped) | ❌ | `` hub-switch-${c.id} `` |
| Nav | SidePanel sign out | SidePanel.jsx:176 | button | ✅ `side-panel-sign-out` | — |
| Nav | PeriodNav prev/next | PeriodNav.jsx:35,46 | buttons | 🟡 label `labelTestId` + locked prev only | `period-prev-btn`, `period-next-btn` *(optional)* |
| Nav | ArchivedHubsList toggle | ArchivedHubsList.jsx:19 | button | ✅ `archived-section-toggle` | — |
| Nav | HubFooter "+ New BOS Hub" | HubFooter.jsx:48 | button | ❌ | `new-hub-btn` |
| Upgrade | HubFooter "Upgrade to add more hubs" | HubFooter.jsx:39 | button | ❌ | `upgrade-add-hub-btn` |
| Upgrade | UpgradeModal primary CTA | UpgradeModal.jsx:89 | button | ❌ | `` ${testid}-cta `` (prop-derived) |
| Upgrade | PricingView billing toggle | PricingView.jsx:49 | button | ✅ `toggle-${key}` | — |
| Upgrade | PricingView plan/Upgrade CTA | PricingView.jsx:80 | button | ✅ `upgrade-cta` / `plan-${key}` | — |
| Write 🟡 | CreateHubSheet 5-step flow + "Create Hub 🎉" | CreateHubSheet.jsx | sheet + nav + submit | ❌ (none) | see §3 (cluster) |
| Write 🟡 | All other write sheets (AddTransaction, AddCategory, Copy*, CreatePeriod, Confirm, UpdateReceived, invite, AddGuest, CentreSettings, GuestTxn, PinSetup) | various | inputs + save | ✅ covered | — |
| Destructive ⛔ | Archive/Delete, MemberRow remove, ConfirmModal, category/income delete, period reset | various | confirm + danger btn | ✅ covered | — |

### §4 — Cap Gate Coverage

| Gate | Code | Surface | Affordance testid? | Modal testid? | Proposed |
|---|---|---|---|---|---|
| Hub | HUB01 | HubFooter at-cap | ❌ | ❌ | `upgrade-add-hub-btn` + modal `upgrade-modal-hub` |
| Member | MEM01 | MembersSection | ✅ `member-count`, `upgrade-members-btn` | ❌ | modal `upgrade-modal-member` |
| Category | CAT01 | BudgetView + SettingsView | ✅ `category-count`, `upgrade-categories-btn`, `add-category-btn` | ❌ (×2 sites) | modal `upgrade-modal-category-budget` (BudgetView) + `upgrade-modal-category-settings` (SettingsView) — D2 distinct |
| Skin | SKN01 | ThemeSection locked chip | ✅ `theme-${key}` (+ `aria-label "(Pro)"`) | ❌ | modal `upgrade-modal-skin` (+ optional `theme-locked-${key}` marker) |
| History | *(soft)* | PeriodNav prev arrow | ✅ `upgrade-history-affordance` | ❌ | modal `upgrade-modal-history` |

> **Every cap gate needs the `UpgradeModal` testid** to verify *which* `_CAP_BODY` opened without brittle
> text matching. Because the modal is one generic component reused at 6 sites, the fix is a single
> `testid` **prop** on `UpgradeModal` that each consumer passes a per-gate value to (§4 below).

---

## 3. Gap analysis

**Existing (N):** ~224 testid code-sites / 51 files.
**Required NEW for §2+§4 (firm):** **20** · **optional/nice-to-have:** 4 → **gap ≈ 20–24**.

### Missing testids by file (firm scope)

| File | Missing testids | Count | Drives |
|---|---|---|---|
| `components/ui/UpgradeModal.jsx` | add `testid` **prop** → container gets it + CTA `${testid}-cta` | 1 prop (2 attrs) | §4 all gates, §2 upgrade CTA |
| `components/layout/HubFooter.jsx` | `upgrade-add-hub-btn`, `new-hub-btn`, pass `testid="upgrade-modal-hub"` | 3 | §4 HUB01, §2 nav |
| `views/settings/MembersSection.jsx` | pass `testid="upgrade-modal-member"` | 1 | §4 MEM01 |
| `views/BudgetView.jsx` | pass `testid="upgrade-modal-category-budget"` | 1 | §4 CAT01 |
| `views/SettingsView.jsx` | pass `testid="upgrade-modal-category-settings"` | 1 | §4 CAT01 (2nd surface) |
| `views/settings/ThemeSection.jsx` | pass `testid="upgrade-modal-skin"` | 1 | §4 SKN01 |
| `components/layout/PeriodNav.jsx` | pass `testid="upgrade-modal-history"` | 1 | §4 history |
| `components/layout/Header.jsx` | `header-settings-btn`, `header-hub-switcher-btn` | 2 | §2 nav |
| `components/layout/BottomNav.jsx` | `` nav-tab-${tab.key} `` (one pattern, 5 tabs) | 1 | §2 nav |
| `components/layout/FAB.jsx` | `fab-add-transaction` | 1 | §2 nav |
| `components/layout/SidePanel.jsx` | `` hub-switch-${c.id} `` (one pattern) | 1 | §2 nav |
| `features/hubs/CreateHubSheet.jsx` | `create-hub-sheet`, `create-hub-close-btn`, `create-hub-back-btn`, `create-hub-continue-btn`, `create-hub-submit-btn` | 5 | §2 write (stop-at-submit) |
| **Firm total** | | **~20** | |

### Optional / nice-to-have (flag, decide at review)
| File | testid | Why optional |
|---|---|---|
| PeriodNav.jsx | `period-prev-btn`, `period-next-btn` | §2 says assert *label* change (already has `labelTestId`); arrow testids only ease clicking |
| ThemeSection.jsx | `` theme-locked-${key} `` | `theme-${key}` + `aria-label "(Pro)"` already distinguish locked chips |

### What is NOT a gap (explicitly in scope but already covered)
- All write-form inputs and Save/Cancel buttons except CreateHubSheet.
- All destructive confirm flows (archive/delete/remove/reset).
- PricingView (toggle, plan cards, upgrade CTA, errors).
- `access-blocked`, `upgrade-history-affordance`, all `member-count`/`category-count` counters.

### Estimated scope
- **Files touched:** ~12 (`src/`). **New `.jsx` files:** 0 → **audit baseline stays 277/0** (audit counts checks, not testids; no new components, no new files).
- **LOC touched:** ~25–30 lines (mostly single-attribute additions; UpgradeModal needs the `testid` prop wired into 2 elements).
- **Tests:** each touched component should gain ≥1 assertion that the new testid renders (and, for UpgradeModal, that the per-gate `testid` lands). Estimate **+12 to +20 tests** → new test total ~**1525–1533**. Exact count set at implementation; CLAUDE.md §8 requires the count in the commit subject.

---

## 4. Naming convention

**Decision: continue the existing convention — do NOT introduce a new prefix scheme.** The proposed
`cta-*` / `form-*` / `modal-*` / `gate-*` / `state-*` prefixes (in the task brief) **conflict** with the
established pattern across 224 sites. CLAUDE.md's consistency ethos wins: document and extend what's there.

### The established convention (observed)
**`kebab-case`, noun-first, type-suffixed.** The *suffix* encodes the element kind:

| Suffix | Element | Examples |
|---|---|---|
| `-btn` | clickable button | `add-category-btn`, `send-invite-btn`, `centre-save-btn` |
| `-cta` | primary call-to-action button | `upgrade-cta`, `plan-cta`, `create-period-cta` |
| `-input` | text/number input | `invite-email-input`, `period-name-input` |
| `-select` | dropdown | `invite-role-select`, `centre-currency-select` |
| `-toggle` | toggle/switch | `from-spare-toggle`, `copy-prev-toggle` |
| `-sheet` / `-dialog` / `-screen` / `-flow` / `-prompt` / `-section` | container | `copy-categories-sheet`, `archive-hub-dialog`, `pin-setup-flow` |
| `-count` / `-label` / `-display` / `-amount` | read-only value | `member-count`, `centre-name-display`, `budget-total-spent` |
| `-error` / `-msg` / `-message` / `-warning` | status text | `guest-form-error`, `pin-mismatch-msg`, `lockout-message` |
| `-affordance` | a locked/gated control | `upgrade-history-affordance` |
| `` -${id} `` / `` -${key} `` suffix | per-row dynamic | `tx-delete-${tx.id}`, `theme-${s.key}`, `nav-tab-${key}` |

### Rules for Phase 2.5 additions
1. **Continue suffix-typing** — buttons end `-btn` (or `-cta` for a primary upgrade/submit action).
2. **Cap-gate modals (D2):** `upgrade-modal-{gate}` where `{gate}` ∈ `hub | member | category-budget |
   category-settings | skin | history` — the two CAT01 surfaces get **distinct** testids so a test can
   tell BudgetView's modal from SettingsView's. This mirrors the existing `upgrade-{gate}-btn` affordance
   names and the lone `upgrade-history-affordance`. The modal's CTA derives as `` ${testid}-cta `` →
   e.g. `upgrade-modal-hub-cta`.
3. **Dynamic lists:** templated `` `name-${id}` `` / `` `name-${key}` `` — never hardcode an index.
4. **Do NOT rename existing testids.** The `centre-*` testids (`centre-edit-btn`, `centre-name-input`,
   etc.) stay as-is despite the UI "Hub" rename — they are internal test hooks, not user-facing strings
   (CLAUDE.md DB↔UI split; memory #8). Renaming them is pure churn with no test-coverage benefit.

---

## 5. Implementation plan (suggested commit boundaries)

Split by feature area — **not** one massive commit. Each commit: add testids + add/extend the matching
`*.test.jsx` assertions + run `npm test -- --run` + `bash scripts/audit.sh` + §9.5 triple-check.

| # | Commit | Files | Why grouped | Est. tests |
|---|---|---|---|---|
| 1 | `test(v2): UpgradeModal testid prop + 5 cap-gate consumers wire it, N tests` | UpgradeModal + HubFooter, MembersSection, BudgetView, SettingsView, ThemeSection, PeriodNav | The keystone — the generic modal prop + all 6 consumers must land together so every §4 row can assert `upgrade-modal-{gate}` opens. Highest value first. | +6–8 |
| 2 | `test(v2): app-chrome nav testids — Header, BottomNav, FAB, SidePanel hub-switch, N tests` | Header, BottomNav, FAB, SidePanel | All §2 "Navigation & chrome" row; small, cohesive, no logic risk. | +5–7 |
| 3 | `test(v2): HubFooter cap + create-hub affordance testids, N tests` | HubFooter (`upgrade-add-hub-btn`, `new-hub-btn`) | Completes HUB01 affordance + §2 "+ New BOS Hub". (If commit 1 already added HubFooter's modal prop, fold these two button testids into commit 1 to avoid touching the file twice — see note.) | +2–3 |
| 4 | `test(v2): CreateHubSheet step-nav + stop-at-submit testids, N tests` | CreateHubSheet | Self-contained 5-step flow; the §2 stop-before-submit write CTA. Its sub-steps reuse onboarding components (already have some testids). | +3–5 |
| 5 *(optional)* | `test(v2): PeriodNav arrow + ThemeSection locked-chip testids, N tests` | PeriodNav, ThemeSection | Only if review approves the §3 optional items. | +2–4 |

> **Sequencing note:** HubFooter appears in both commit 1 (modal prop) and commit 3 (its two buttons).
> To avoid touching the same file in two commits, **either** fold the two HubFooter button testids into
> commit 1, **or** keep commit 1 to the modal-prop wiring only and do all HubFooter button work in
> commit 3. Recommend folding into commit 1 (one file edit, HUB01 fully done in one commit). Decide at
> review.

> **Order rationale:** Commit 1 unblocks all §4 cap-gate Playwright assertions (the reason Phase 2.5
> exists per §7.6). Commits 2–4 unblock §2. Commit 5 is polish.

---

## 6. Incidental findings

**`category-count` / `upgrade-categories-btn` intentionally duplicated** across SettingsView and
BudgetCategoryList — that's correct (two routes render the CAT01 affordance). Tests must scope by
route/container, not assume uniqueness. (Not a bug; noted so Phase 2.5/3 tests don't treat it as one.)

---

## 7. Backlog — tracked, NOT Phase 2.5 (per D4)

| ID | Finding | Detail | Action |
|---|---|---|---|
| **BL-1** | Duplicate testid in `PaydayHeader.jsx` | `payday-total-received` appears at **both line 50 and line 60**. If both can render simultaneously, a `getByTestId('payday-total-received')` throws on the duplicate (Testing Library + Playwright both reject multi-match). Likely mutually-exclusive branches (e.g. received-state vs zero-state), but unverified. | Separate `fix(v2)` commit: read PaydayHeader, confirm whether both branches can co-render; if so, rename one (e.g. `payday-total-received-zero`); add a test asserting a single match. **Do not bundle with Phase 2.5** — it is a correctness fix, not selector coverage. |

---

**Next step after approval:** implement commits 1→5 in order (see §5), each gated by tests + audit +
§9.5, on `dev`. Decisions D1–D4 above are locked. **Hold here** until Commit 1 is greenlit.
