/**
 * localStorage persistence layer — MVP implementation.
 *
 * SECURITY NOTE: This is MVP guest access only.
 * Production should use backend-issued guest tokens and server-side
 * access rules. Never store sensitive data in localStorage in production.
 *
 * LIMITATION: localStorage is per-browser-per-device.
 * If the family enables guest access on their phone and the nanny opens
 * the link on her own phone, the nanny's browser has no knowledge of
 * the enabled state. Production fix = Supabase/Firebase backend.
 *
 * MVP WORKAROUND for cross-device: encode guest settings in the URL.
 * See buildGuestPortalUrl() in lib/guest.js.
 */

const KEYS = {
  GUEST_SETTINGS: 'ff_guest_settings',
  NOTIFS:         'ff_notifs',
  THEME:          'ff_theme',
  TRANSACTIONS:   'ff_transactions',
};

/** Save a value to localStorage as JSON */
export const persist = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('[Storage] Failed to persist:', key, e);
  }
};

/** Load a value from localStorage, returns null if missing or corrupt */
export const load = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('[Storage] Failed to load:', key, e);
    return null;
  }
};

export { KEYS };
