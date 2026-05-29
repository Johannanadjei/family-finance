# Money B.O.S — Cosmetic Backlog

Captured 2026-05-26. Work split across two upcoming sessions: A (Brand + Layout) and B (Visual + A11y + Interaction + Emoji).

## Session A — Brand + Terminology + Logo + Layout

### Brand / Terminology
- **B1.** New Money B.O.S logo asset — replace existing BOS icon across app, PWA manifest, favicon, splash. Keep logo unthemed across skins.
- **B2.** Rename "Budget Centre" → "BOS Hub" everywhere in UI:
  - "+ New Control Centre" → "+ New BOS Hub"
  - "X Control Centres" → "X BOS Hubs"
  - Tap-a-hub-to-switch copy
  - Settings section heading → "BOS Hubs"
  - "Archived" → "Archived Hubs"
  - Do NOT rename database table `budget_centres` or field `budget_centre_id` — UI terminology only.
- **B3.** Hub creation flow: "Small business" option → "Business".
- **B4.** Confirm placement of tagline "Budget Overview System" — splash, Settings → About, or omitted in-app.

### Layout / Responsiveness
- **L1.** Settings page: collapsible/expandable sections (start collapsed) for Budget Categories. Consider same pattern for Members, Theme, BOS Hubs sections.
- **L2.** New BOS Hub flow step 3 of 5 — X (delete) buttons cropped on some mobile screens. Audit overflow on all onboarding steps, iOS + Android.
- **L3.** Dropdown chevrons touching edges — add horizontal padding in select inputs, both platforms.
- **L4.** Modal scroll-lock: body behind must not scroll when any modal/sheet is open. Build single `useBodyScrollLock` hook applied in SidePanel + AddTransactionSheet + any other sheet.

## Session B — Visual + Accessibility + Interaction + Emoji

### Accessibility / Contrast
- **A1.** Audit all mid-grey body text against WCAG AA contrast (4.5:1). Specifically: "Invite member" subtext on Settings. Lighten any failing text. Audit across mono skin.
- **A2.** Panda skin: edit Budget Centre block in Settings — Cancel button shows black on black (no visible text). Fix token mapping.

### Visual Bugs
- **V1.** Home screen budget health bar in family_warmth skin — rendering white instead of green. Token mismatch (likely `--c-success` or `--c-accent` not applied to bar fill).
- **V2.** Settings → Guests block: full URL displayed. Truncate with ellipsis (CSS: `text-overflow: ellipsis; white-space: nowrap; max-width`).
- **V3.** Establish reusable truncation pattern (component or utility) for long-string fields (member emails, hub names).

### Interaction Fixes
- **I1.** Settings → Income source edit: tick to save closes form but does not persist. Hook regression. Read `useFinance.js` editIncomeSource flow.
- **I2.** Quick yes/no inline confirmation on Log screen delete. Reuse the inline confirm pattern already in MembersSection.

### Build / PWA
- **B1.** Dual web-app manifest — `index.html` hard-links `/manifest.json` (static `public/`) AND vite-plugin-pwa injects `/manifest.webmanifest`. The static one wins (first `rel="manifest"` in document order); both currently point to the same `bos-icon-v2-*` icons so it's harmless, but it's fragile parallel maintenance. Pick one source of truth: either delete `public/manifest.json` + the `index.html` link and let the plugin own it, or keep the static one and stop the plugin generating its own. Cosmetic, not breaking. (Diagnosed 2026-05-29 during logo polish.)

### Feature Additions
- **F1.** Emoji picker overhaul — WhatsApp-style scrollable picker for category icons. Same picker reused in Add Category (Budget view) AND FAB Add Transaction (Daily view). Categories to add: gas, food, hearts, football, business types, international travel, church, coffin, wedding, tie, chef, nanny, etc. One source of truth in `lib/emoji.js`.

## Deferred Decisions (no work, decision recorded)
- **F2.** Inline edit saved transaction via FAB — **DEFERRED**. Current delete + re-add flow is acceptable. Revisit when real users request it. Reasoning: 200+ lines of code/tests, no current user demand, ship security audit + payments first.
