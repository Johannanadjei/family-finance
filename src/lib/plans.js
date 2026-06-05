/**
 * lib/plans.js
 *
 * Single source of truth for Free vs Pro capability limits.
 * Pure constants — no React, no DB, no money. Pricing lives in lib/pricing.js.
 *
 * LOCKED 2026-06-05 (see docs/engineering-decisions.md, freemium foundation entry).
 * Consolidates caps that were previously scattered/duplicated across lib/roles.js
 * (MAX_MEMBERS) and features/onboarding/onboarding.constants.js (MAX_FREE_*).
 * Those consumers migrate to these constants during the GATE commits, not the
 * foundation commit — this file ships ahead of its readers.
 *
 * NOTE on Infinity: used for unbounded caps so runtime compares (`count < limit`)
 * just work. This is a static module that is NEVER serialized — do not send these
 * objects over the wire (`JSON.stringify(Infinity) === 'null'`).
 */

export const FREE_LIMITS = {
  maxHubs:                1,
  maxMembersPerHub:       2,
  maxCategoriesPerHub:    10,
  maxIncomeStreams:       2,
  historyMonthsVisible:   3,
  allowMultiCurrency:     false,
  allowAllSkins:          false,
  allowCustomEmojiPicker: false,
  allowFullExport:        false,
};

export const PRO_LIMITS = {
  maxHubs:                10,
  maxMembersPerHub:       15,
  maxCategoriesPerHub:    Infinity,
  maxIncomeStreams:       Infinity,
  historyMonthsVisible:   Infinity,
  allowMultiCurrency:     true,
  allowAllSkins:          true,
  allowCustomEmojiPicker: true,
  allowFullExport:        true,
};

/** Tier → limits lookup. Use as PLAN_LIMITS[tier].maxHubs. */
export const PLAN_LIMITS = { free: FREE_LIMITS, pro: PRO_LIMITS };

/**
 * Resolve the limits object for a tier. Any unknown tier falls back to FREE_LIMITS
 * — the safe default that matches "no subscription row → free".
 *
 * @param {'free'|'pro'} tier
 * @returns {typeof FREE_LIMITS}
 */
export function getLimitsForTier(tier) {
  return tier === 'pro' ? PRO_LIMITS : FREE_LIMITS;
}
