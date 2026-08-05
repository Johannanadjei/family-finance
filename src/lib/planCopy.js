/**
 * lib/planCopy.js
 *
 * Shared user-facing copy for plan-cap UpgradeModal dialogs. Each gate (member,
 * category, …) keeps its modal body here so the strings live in one place and can't
 * drift between multiple consumers (e.g. the category cap is shown from both
 * BudgetView and SettingsView).
 *
 * Each body is two paragraphs: the current free limit, then a present-tense
 * "Upgrade to Pro to …" line ending in the price. The UpgradeModal CTA (wired to
 * /pricing) is the action — the copy no longer says "coming soon" now that Pro is
 * purchasable end-to-end.
 *
 * NOTE: the hub cap stays as UpgradeModal's DEFAULT_BODY — it is the only consumer
 * of the defaults, so there is nothing to share. Future gates add their copy here.
 */

// Non-owner substitute for the pay CTA at every hub-scoped cap gate. The cap
// MESSAGE stays visible to all roles — a standard/full_access member hits the same
// shared limit and must be told why — but the purchase path is owner-only: a
// subscription attaches to the PAYER's user_id, while create_category /
// create_invite / update_centre_skin all resolve the cap from
// budget_centres.owner_id → subscriptions. A non-owner paying would upgrade their
// own account and change nothing about this hub.
//
// This can only ever render on a hub whose owner is genuinely on Free: the gates
// key on hubPlan (the owner's tier), so a paid hub shows no cap at all.
export const ASK_OWNER_LINE = 'Ask your hub owner to upgrade to Pro.';

// Label for a cap CTA shown to a non-owner. States the limit without implying they
// can buy past it; still opens the same modal, which carries the full explanation.
export const CAP_REACHED_LABEL = 'Limit reached';

// Member-cap UpgradeModal body (moved from MembersSection.jsx — single source now).
export const MEMBER_CAP_BODY = [
  "You've reached your hub's member limit. Free hubs can have 2 members (you + 1 invited).",
  'Upgrade to Pro to have up to 15 members. Pro is ₵40/month or ₵400/year.',
];

// Category-cap UpgradeModal body (Decision D5 — agreed copy).
export const CATEGORY_CAP_BODY = [
  "You've reached your hub's category limit for this period. Free hubs can have 10 categories per budget period.",
  'Upgrade to Pro to add unlimited categories. Pro is ₵40/month or ₵400/year.',
];

// History-cap UpgradeModal body (Decision D7 — agreed copy). Shown from BudgetView's
// at-wall prev-arrow affordance when a free user has older budget periods hidden.
export const HISTORY_CAP_BODY = [
  "You've reached your plan's history limit. Free hubs can see the last 3 budget periods.",
  'Upgrade to Pro to access all your budget history. Pro is ₵40/month or ₵400/year.',
];

// Skin-cap UpgradeModal body (Decision D1 — agreed copy). Shown from ThemeSection's
// tappable locked-skin chips when a free user taps a Pro skin.
export const SKIN_CAP_BODY = [
  "You've reached your plan's skin limit. Free hubs use the family_warmth skin.",
  'Upgrade to Pro to use all skins. Pro is ₵40/month or ₵400/year.',
];
