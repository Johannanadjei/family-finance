/**
 * lib/planCopy.js
 *
 * Shared user-facing copy for plan-cap UpgradeModal dialogs. Each gate (member,
 * category, …) keeps its modal body here so the strings live in one place and can't
 * drift between multiple consumers (e.g. the category cap is shown from both
 * BudgetView and SettingsView).
 *
 * Curly apostrophe (’) throughout to byte-match the hub-cap convention in
 * UpgradeModal's DEFAULT_BODY.
 *
 * NOTE: the hub cap stays as UpgradeModal's DEFAULT_BODY — it is the only consumer
 * of the defaults, so there is nothing to share. Future gates add their copy here.
 */

// Member-cap UpgradeModal body (moved from MembersSection.jsx — single source now).
export const MEMBER_CAP_BODY = [
  "You've reached your hub's member limit. Free hubs can have 2 members (you + 1 invited).",
  'Pro hubs will be able to have up to 15 members (₵40/month or ₵400/year) — Pro is coming soon. We’ll let you know when it launches.',
];

// Category-cap UpgradeModal body (Decision D5 — agreed copy).
export const CATEGORY_CAP_BODY = [
  "You've reached your hub's category limit for this period. Free hubs can have 10 categories per budget period.",
  'Pro hubs will be able to have unlimited categories (₵40/month or ₵400/year) — Pro is coming soon. We’ll let you know when it launches.',
];

// History-cap UpgradeModal body (Decision D7 — agreed copy). Shown from BudgetView's
// at-wall prev-arrow affordance when a free user has older budget periods hidden.
export const HISTORY_CAP_BODY = [
  "You've reached your plan's history limit. Free hubs can see the last 3 budget periods.",
  'Pro hubs will be able to access all history (₵40/month or ₵400/year) — Pro is coming soon. We’ll let you know when it launches.',
];

// Skin-cap UpgradeModal body (Decision D1 — agreed copy). Shown from ThemeSection's
// tappable locked-skin chips when a free user taps a Pro skin.
export const SKIN_CAP_BODY = [
  "You've reached your plan's skin limit. Free hubs use the family_warmth skin.",
  'Pro hubs will be able to use all skins (₵40/month or ₵400/year) — Pro is coming soon. We’ll let you know when it launches.',
];
