/**
 * lib/storage.js
 *
 * localStorage for UI preferences only.
 * Never stores financial data, transactions, or household information.
 *
 * ALLOWED:
 *   theme_skin          — active skin name
 *   theme_accent        — active accent colour
 *   notifications       — notification preference object
 *   period_receipt_seen — which auto-continue receipts the user has dismissed
 *                         (a map of hub-id + month keys → true; no amounts, no names)
 *
 * NEVER STORE:
 *   transactions, amounts, categories, income, budget centre data
 */

const KEYS = {
  THEME_SKIN:       'ffc_theme_skin',
  THEME_ACCENT:     'ffc_theme_accent',
  NOTIFICATIONS:    'ffc_notifications',
  ACTIVE_CENTRE_ID: 'ffc_active_centre_id',
  PIN_ATTEMPTS:     'ffc_pin_attempts',
  LOCKOUT_UNTIL:    'ffc_lockout_until',
  PERIOD_RECEIPT:   'ffc_period_receipt_seen',
};

// sessionStorage key — wiped on tab/app close intentionally
const SESSION_PIN_UNLOCKED = 'ffc_pin_unlocked';

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

/** Save / load / clear the active budget centre ID */
export const saveActiveCentreId = (id) => persist(KEYS.ACTIVE_CENTRE_ID, id);
export const loadActiveCentreId = ()   => load(KEYS.ACTIVE_CENTRE_ID);
export const clearActiveCentreId = ()  => remove(KEYS.ACTIVE_CENTRE_ID);

/** Clear all UI preferences — used on sign out */
export const clearPrefs = () => {
  remove(KEYS.THEME_SKIN);
  remove(KEYS.THEME_ACCENT);
  remove(KEYS.NOTIFICATIONS);
  remove(KEYS.ACTIVE_CENTRE_ID);
  remove(KEYS.PIN_ATTEMPTS);
  remove(KEYS.LOCKOUT_UNTIL);
  remove(KEYS.PERIOD_RECEIPT);
  try { sessionStorage.removeItem(SESSION_PIN_UNLOCKED); } catch (e) { /* ignore */ }
};

// ── PIN session / lockout helpers ─────────────────────────────────────────────

/** Mark the PIN as verified for this session (sessionStorage — clears on tab close) */
export const savePinUnlocked = () => {
  try { sessionStorage.setItem(SESSION_PIN_UNLOCKED, '1'); } catch (e) { /* ignore */ }
};

/** Clear the session PIN unlock flag */
export const clearPinUnlocked = () => {
  try { sessionStorage.removeItem(SESSION_PIN_UNLOCKED); } catch (e) { /* ignore */ }
};

/** Check if the PIN has been verified this session */
export const isPinUnlocked = () => {
  try { return sessionStorage.getItem(SESSION_PIN_UNLOCKED) === '1'; } catch (e) { return false; }
};

/** Get the number of failed PIN attempts (0 if never set) */
export const getPinAttempts = () => {
  const v = load(KEYS.PIN_ATTEMPTS);
  return typeof v === 'number' ? v : 0;
};

/** Set the failed PIN attempt count */
export const setPinAttempts = (n) => persist(KEYS.PIN_ATTEMPTS, n);

/** Get the lockout expiry timestamp (epoch ms), or null */
export const getLockoutUntil = () => load(KEYS.LOCKOUT_UNTIL);

/** Set the lockout expiry timestamp (epoch ms) */
export const setLockoutUntil = (ts) => persist(KEYS.LOCKOUT_UNTIL, ts);

// ── Auto-continue receipt dismissal (Decision Q3) ─────────────────────────────
// The "September started, budget carried over" card is dismissable, and the
// dismissal sticks per HUB + MONTH: dismissing September in one hub must not hide
// October, nor hide September in another hub. Stored as a map keyed
// `${centreId}:${YYYY-MM}` → true. Ids and a month string only — no amounts, no
// category or income names, nothing that would make this financial data.
//
// A UI preference, so localStorage is the right home (CLAUDE.md §11). Losing it is
// harmless: the worst case is a receipt reappearing once, never a lost period.

const receiptKey = (centreId, month) => `${centreId}:${month}`;

/** True when the user has already dismissed this hub+month's carry-over receipt. */
export const isPeriodReceiptDismissed = (centreId, month) => {
  if (!centreId || !month) return false;
  const seen = load(KEYS.PERIOD_RECEIPT);
  return !!(seen && seen[receiptKey(centreId, month)]);
};

/** Remember that this hub+month's carry-over receipt was dismissed. */
export const dismissPeriodReceipt = (centreId, month) => {
  if (!centreId || !month) return;
  const seen = load(KEYS.PERIOD_RECEIPT) || {};
  persist(KEYS.PERIOD_RECEIPT, { ...seen, [receiptKey(centreId, month)]: true });
};

export { DEFAULT_PREFS };
