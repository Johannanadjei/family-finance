/**
 * lib/storage.js
 *
 * localStorage for UI preferences only.
 * Never stores financial data, transactions, or household information.
 *
 * ALLOWED:
 *   theme_skin    — active skin name
 *   theme_accent  — active accent colour
 *   notifications — notification preference object
 *
 * NEVER STORE:
 *   transactions, amounts, categories, income, budget centre data
 */

const KEYS = {
  THEME_SKIN:    'ffc_theme_skin',
  THEME_ACCENT:  'ffc_theme_accent',
  NOTIFICATIONS: 'ffc_notifications',
};

const DEFAULT_PREFS = {
  themeSkin:     'family_warmth',
  themeAccent:   'emerald',
  notifications: {
    newPayment:        true,
    categoryOverspent: true,
    weeklySummary:     true,
    monthlySummary:    true,
  },
};

/** Save a value to localStorage as JSON */
const persist = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('[storage] Failed to persist:', key, e);
  }
};

/** Load a value from localStorage — returns null if missing or corrupt */
const load = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('[storage] Failed to load:', key, e);
    return null;
  }
};

/** Remove a key from localStorage */
const remove = (key) => {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.warn('[storage] Failed to remove:', key, e);
  }
};

/** Load all UI preferences — returns defaults for any missing values */
export const loadPrefs = () => ({
  themeSkin:     load(KEYS.THEME_SKIN)    ?? DEFAULT_PREFS.themeSkin,
  themeAccent:   load(KEYS.THEME_ACCENT)  ?? DEFAULT_PREFS.themeAccent,
  notifications: load(KEYS.NOTIFICATIONS) ?? DEFAULT_PREFS.notifications,
});

/** Save theme skin */
export const saveThemeSkin = (skin) => persist(KEYS.THEME_SKIN, skin);

/** Save theme accent */
export const saveThemeAccent = (accent) => persist(KEYS.THEME_ACCENT, accent);

/** Save notification preferences */
export const saveNotifications = (notifs) => persist(KEYS.NOTIFICATIONS, notifs);

/** Clear all UI preferences — used on sign out */
export const clearPrefs = () => {
  remove(KEYS.THEME_SKIN);
  remove(KEYS.THEME_ACCENT);
  remove(KEYS.NOTIFICATIONS);
};

export { DEFAULT_PREFS };
