/**
 * lib/themes.js
 *
 * CSS variable token maps for all app skins.
 * applyTheme() sets variables on :root — all components inherit them.
 * Never hardcode hex values in components — always use var(--c-*)
 *
 * Free skin: family_warmth (ships now)
 * Pro skins: defined but empty — filled in Session 9
 */

export const THEMES = {
  family_warmth: {
    '--c-primary':      '#064e3b',
    '--c-primary-2':    '#0d7060',
    '--c-accent':       '#059669',
    '--c-accent-light': '#f0fdf4',
    '--c-header-from':  '#064e3b',
    '--c-header-to':    '#0d7060',
    '--c-text':         '#1c1917',
    '--c-muted':        '#6b7280',
    '--c-bg':           '#f3f4f6',
    '--c-card':         '#ffffff',
    '--c-border':       '#e5e7eb',
    '--c-input-bg':     '#f9fafb',
    '--c-input-border': '#e5e7eb',
    '--c-danger':        '#dc2626',
    '--c-success':       '#059669',
    '--c-warning':       '#d97706',
    '--c-danger-bg':     '#fef2f2',
    '--c-danger-light':  '#fca5a5',
    '--c-success-light': '#6ee7b7',
    '--c-warning-bg':    '#fef3c7',
    '--c-warning-text':  '#92400e',
    '--c-shadow':        '0 2px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)',
  },
  midnight_pro: {},
  ocean_pro:    {},
  gold_pro:     {},
  rose_pro:     {},
};

/**
 * Apply a skin's CSS variable tokens to the document root.
 * Falls back to family_warmth if skin is unknown or incomplete.
 * @param {string} skinName
 */
export const applyTheme = (skinName) => {
  const tokens = THEMES[skinName] || THEMES.family_warmth;
  const base   = Object.keys(tokens).length ? tokens : THEMES.family_warmth;
  const root   = document.documentElement;
  Object.entries(base).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
};
