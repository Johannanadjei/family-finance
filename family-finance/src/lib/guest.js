/**
 * Guest session logic — pure functions, no React, no side effects.
 *
 * SECURITY NOTE: MVP guest access only.
 * Production should use backend-issued guest tokens and server-side
 * access rules. PIN is not encrypted here.
 *
 * ARCHITECTURE:
 *   Family URL:  /                  → family dashboard only
 *   Guest URL:   /?portal=guest&e=1&n=Staff+Portal
 *                                   → PIN screen only, family data never shown
 *
 * Cross-device approach: non-sensitive settings (enabled flag, portal name)
 * are encoded in the URL so guests on other devices get the right screen.
 * The PIN is NOT in the URL — it must be shared separately (verbally/message).
 */

import { load, KEYS } from './storage';

/** Detect if current URL is a guest portal entry */
export const isGuestPortalUrl = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('portal') === 'guest';
};

/**
 * Read guest settings for the portal screen.
 * Priority: URL params (cross-device) → localStorage (same device) → defaults.
 * The PIN always comes from localStorage (never the URL).
 */
export const readPortalSettings = () => {
  const params   = new URLSearchParams(window.location.search);
  const saved    = load(KEYS.GUEST_SETTINGS);

  // URL param 'e' encodes enabled state for cross-device sharing
  const enabledFromUrl = params.get('e') === '1';
  const nameFromUrl    = params.get('n') ? decodeURIComponent(params.get('n')) : null;

  // Determine enabled: URL param wins if present, else localStorage
  const enabled = params.has('e') ? enabledFromUrl : (saved?.enabled ?? false);
  const label   = nameFromUrl || saved?.label || 'Household Staff Portal';
  const pin     = saved?.pin || '1234';  // PIN only from localStorage, never URL

  // Debug log — remove in production
  console.debug('[GuestPortal] enabled:', enabled, '| source:', params.has('e') ? 'URL' : 'localStorage');

  return { enabled, label, pin, allowedCategories: saved?.allowedCategories || [] };
};

/** Validate a PIN attempt against the stored PIN */
export const validatePin = (attempt, storedPin) =>
  String(attempt).trim() === String(storedPin).trim();

/** Determine which categories a guest can log against */
export const getGuestCategories = (allCategories, allowedCategories) => {
  if (!allowedCategories || allowedCategories.length === 0) return allCategories;
  return allCategories.filter(cat => allowedCategories.includes(cat));
};

/**
 * Build a guest transaction with the full data model.
 *
 * Data model:
 *   id          — assigned by addTransaction (Date.now())
 *   date        — ISO date string YYYY-MM-DD
 *   week        — 'Week 1' | 'Week 2' | 'Week 3' | 'Week 4' | 'Week 5'
 *   type        — always 'Expense' for guest submissions
 *   category    — selected category name
 *   description — optional note from guest
 *   amount      — number (GHS)
 *   submittedBy — guest's name
 *   source      — 'guest_portal' to distinguish from main app entries
 *   createdAt   — ISO timestamp when submitted
 *
 * Category matching note:
 *   If the category exists in FIXED_EXPENSES → counted against that budget category.
 *   If not (e.g. 'Other') → counted as variable spending.
 *
 * FIREBASE SYNC POINT: syncGuestExpenseToBackend(tx) called after addTransaction.
 */
export const buildGuestTransaction = ({ category, amount, description, date, week, guestName }) => ({
  date:        date || new Date().toISOString().split('T')[0],
  week:        week || 'Week 1',
  type:        'Expense',
  category,
  description: description || '',
  amount:      parseFloat(amount) || 0,
  submittedBy: guestName,
  source:      'guest_portal',
  createdAt:   new Date().toISOString(),
});

/**
 * Build the shareable guest portal URL.
 * Encodes enabled state and portal name so cross-device guests see
 * the correct screen even before localStorage syncs (MVP approach).
 * PIN is intentionally NOT included in the URL.
 */
export const buildGuestPortalUrl = (guestSettings) => {
  const base   = window.location.origin + window.location.pathname;
  const params = new URLSearchParams({
    portal: 'guest',
    e:      guestSettings.enabled ? '1' : '0',
    n:      encodeURIComponent(guestSettings.label || 'Household Staff Portal'),
  });
  return base + '?' + params.toString();
};
