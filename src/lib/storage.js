/**
 * localStorage persistence layer — MVP implementation.
 *
 * SECURITY NOTE: This is MVP only.
 * Never store sensitive data (tokens, passwords, PII) in localStorage.
 *
 * LIMITATION: localStorage is per-browser-per-device.
 * Production fix for cross-device = Supabase backend.
 *
 * MVP WORKAROUND for cross-device guest access: encode settings in URL.
 * See buildGuestPortalUrl() in lib/guest.js.
 */

const KEYS = {
  GUEST_SETTINGS:    'ff_guest_settings',
  NOTIFS:            'ff_notifs',
  THEME:             'ff_theme',
  TRANSACTIONS:      'ff_transactions',
  ONBOARDING_DRAFT:  'ff_onboarding_draft',
};

/** Save a value to localStorage as JSON */
export const persist = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('[Storage] Failed to persist:', key, e);
  }
};

/** Load a value from localStorage. Returns null if missing or corrupt. */
export const load = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('[Storage] Failed to load:', key, e);
    return null;
  }
};

/** Remove a key from localStorage */
export const remove = (key) => {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.warn('[Storage] Failed to remove:', key, e);
  }
};

export { KEYS };
