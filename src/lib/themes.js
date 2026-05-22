/**
 * lib/themes.js
 *
 * CSS variable token maps for all app skins.
 * applyTheme() sets variables on :root — all components inherit them.
 * Never hardcode hex values in components — always use var(--c-*)
 *
 * Free skin:  family_warmth
 * Pro skins:  corporate_navy, airbnb_coral, shop_gold, property_slate,
 *             minimal_dark, ghana_warm, premium_neutral
 */

const SHARED = {
  '--c-danger':        '#dc2626',
  '--c-success':       '#059669',
  '--c-warning':       '#d97706',
  '--c-danger-bg':     '#fef2f2',
  '--c-danger-light':  '#fca5a5',
  '--c-success-light': '#6ee7b7',
  '--c-warning-bg':    '#fef3c7',
  '--c-warning-text':  '#92400e',
  '--c-shadow':        '0 2px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)',
};

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
    ...SHARED,
  },

  corporate_navy: {
    '--c-primary':      '#1e3a5f',
    '--c-primary-2':    '#1e40af',
    '--c-accent':       '#3b82f6',
    '--c-accent-light': '#eff6ff',
    '--c-header-from':  '#1e3a5f',
    '--c-header-to':    '#1e40af',
    '--c-text':         '#0f172a',
    '--c-muted':        '#64748b',
    '--c-bg':           '#f1f5f9',
    '--c-card':         '#ffffff',
    '--c-border':       '#e2e8f0',
    '--c-input-bg':     '#f8fafc',
    '--c-input-border': '#e2e8f0',
    ...SHARED,
  },

  airbnb_coral: {
    '--c-primary':      '#9f1239',
    '--c-primary-2':    '#be123c',
    '--c-accent':       '#f43f5e',
    '--c-accent-light': '#fff1f2',
    '--c-header-from':  '#9f1239',
    '--c-header-to':    '#be123c',
    '--c-text':         '#1c1917',
    '--c-muted':        '#78716c',
    '--c-bg':           '#fff7f7',
    '--c-card':         '#ffffff',
    '--c-border':       '#fecdd3',
    '--c-input-bg':     '#fff1f2',
    '--c-input-border': '#fecdd3',
    ...SHARED,
  },

  shop_gold: {
    '--c-primary':      '#78350f',
    '--c-primary-2':    '#92400e',
    '--c-accent':       '#d97706',
    '--c-accent-light': '#fffbeb',
    '--c-header-from':  '#78350f',
    '--c-header-to':    '#92400e',
    '--c-text':         '#1c1917',
    '--c-muted':        '#78716c',
    '--c-bg':           '#fdfaf0',
    '--c-card':         '#ffffff',
    '--c-border':       '#fde68a',
    '--c-input-bg':     '#fffbeb',
    '--c-input-border': '#fde68a',
    ...SHARED,
  },

  property_slate: {
    '--c-primary':      '#1e293b',
    '--c-primary-2':    '#334155',
    '--c-accent':       '#475569',
    '--c-accent-light': '#f1f5f9',
    '--c-header-from':  '#1e293b',
    '--c-header-to':    '#334155',
    '--c-text':         '#0f172a',
    '--c-muted':        '#64748b',
    '--c-bg':           '#f8fafc',
    '--c-card':         '#ffffff',
    '--c-border':       '#e2e8f0',
    '--c-input-bg':     '#f8fafc',
    '--c-input-border': '#e2e8f0',
    ...SHARED,
  },

  minimal_dark: {
    '--c-primary':      '#18181b',
    '--c-primary-2':    '#27272a',
    '--c-accent':       '#a1a1aa',
    '--c-accent-light': '#27272a',
    '--c-header-from':  '#09090b',
    '--c-header-to':    '#18181b',
    '--c-text':         '#f4f4f5',
    '--c-muted':        '#a1a1aa',
    '--c-bg':           '#09090b',
    '--c-card':         '#18181b',
    '--c-border':       '#3f3f46',
    '--c-input-bg':     '#27272a',
    '--c-input-border': '#3f3f46',
    '--c-danger':        '#f87171',
    '--c-success':       '#34d399',
    '--c-warning':       '#fbbf24',
    '--c-danger-bg':     '#450a0a',
    '--c-danger-light':  '#991b1b',
    '--c-success-light': '#065f46',
    '--c-warning-bg':    '#451a03',
    '--c-warning-text':  '#fcd34d',
    '--c-shadow':        '0 2px 12px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.3)',
  },

  ghana_warm: {
    '--c-primary':      '#7c2d12',
    '--c-primary-2':    '#9a3412',
    '--c-accent':       '#ea580c',
    '--c-accent-light': '#fff7ed',
    '--c-header-from':  '#7c2d12',
    '--c-header-to':    '#9a3412',
    '--c-text':         '#1c1917',
    '--c-muted':        '#78716c',
    '--c-bg':           '#fef9f3',
    '--c-card':         '#ffffff',
    '--c-border':       '#fed7aa',
    '--c-input-bg':     '#fff7ed',
    '--c-input-border': '#fed7aa',
    ...SHARED,
  },

  premium_neutral: {
    '--c-primary':      '#1c1917',
    '--c-primary-2':    '#292524',
    '--c-accent':       '#57534e',
    '--c-accent-light': '#f5f5f4',
    '--c-header-from':  '#1c1917',
    '--c-header-to':    '#292524',
    '--c-text':         '#1c1917',
    '--c-muted':        '#78716c',
    '--c-bg':           '#f5f5f4',
    '--c-card':         '#ffffff',
    '--c-border':       '#e7e5e4',
    '--c-input-bg':     '#fafaf9',
    '--c-input-border': '#e7e5e4',
    ...SHARED,
  },
};

/**
 * Apply a skin's CSS variable tokens to the document root.
 * Falls back to family_warmth if the skin is unknown or incomplete.
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
