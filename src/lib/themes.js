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

  corporate: {
    '--c-primary':      '#1e3a5f',
    '--c-primary-2':    '#2d5282',
    '--c-accent':       '#4a90d9',
    '--c-accent-light': '#eff6ff',
    '--c-header-from':  '#1e3a5f',
    '--c-header-to':    '#2d5282',
    '--c-text':         '#0f172a',
    '--c-muted':        '#64748b',
    '--c-bg':           '#f8fafc',
    '--c-card':         '#ffffff',
    '--c-border':       '#e2e8f0',
    '--c-input-bg':     '#f8fafc',
    '--c-input-border': '#e2e8f0',
    ...SHARED,
  },

  international: {
    '--c-primary':      '#1a1a2e',
    '--c-primary-2':    '#16213e',
    '--c-accent':       '#4a90d9',
    '--c-accent-light': '#1e2a45',
    '--c-header-from':  '#1a1a2e',
    '--c-header-to':    '#16213e',
    '--c-text':         '#e2e8f0',
    '--c-muted':        '#94a3b8',
    '--c-bg':           '#0f0f1a',
    '--c-card':         '#1a1a2e',
    '--c-border':       '#2d3748',
    '--c-input-bg':     '#16213e',
    '--c-input-border': '#2d3748',
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

  neon: {
    '--c-primary':      '#00ff88',
    '--c-primary-2':    '#00cc6a',
    '--c-accent':       '#00ff88',
    '--c-accent-light': '#0a1a0d',
    '--c-header-from':  '#0d1117',
    '--c-header-to':    '#0d0d0d',
    '--c-text':         '#e2e8f0',
    '--c-muted':        '#6b7280',
    '--c-bg':           '#0d0d0d',
    '--c-card':         '#111111',
    '--c-border':       '#1a1a1a',
    '--c-input-bg':     '#1a1a1a',
    '--c-input-border': '#2a2a2a',
    '--c-danger':        '#ff4444',
    '--c-success':       '#00ff88',
    '--c-warning':       '#ffaa00',
    '--c-danger-bg':     '#1a0000',
    '--c-danger-light':  '#ff6666',
    '--c-success-light': '#00cc6a',
    '--c-warning-bg':    '#1a1100',
    '--c-warning-text':  '#ffcc44',
    '--c-shadow':        '0 2px 12px rgba(0,0,0,0.5), 0 0 8px rgba(0,255,136,0.1)',
  },

  dark: {
    '--c-primary':      '#ffffff',
    '--c-primary-2':    '#e5e7eb',
    '--c-accent':       '#d1d5db',
    '--c-accent-light': '#1f2937',
    '--c-header-from':  '#0f0f0f',
    '--c-header-to':    '#111827',
    '--c-text':         '#f9fafb',
    '--c-muted':        '#9ca3af',
    '--c-bg':           '#0f0f0f',
    '--c-card':         '#1a1a1a',
    '--c-border':       '#374151',
    '--c-input-bg':     '#1f2937',
    '--c-input-border': '#374151',
    '--c-danger':        '#f87171',
    '--c-success':       '#34d399',
    '--c-warning':       '#fbbf24',
    '--c-danger-bg':     '#450a0a',
    '--c-danger-light':  '#991b1b',
    '--c-success-light': '#065f46',
    '--c-warning-bg':    '#451a03',
    '--c-warning-text':  '#fcd34d',
    '--c-shadow':        '0 2px 12px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.4)',
  },

  minimalist: {
    '--c-primary':      '#000000',
    '--c-primary-2':    '#111111',
    '--c-accent':       '#222222',
    '--c-accent-light': '#f5f5f5',
    '--c-header-from':  '#000000',
    '--c-header-to':    '#111111',
    '--c-text':         '#000000',
    '--c-muted':        '#6b7280',
    '--c-bg':           '#ffffff',
    '--c-card':         '#ffffff',
    '--c-border':       '#e5e7eb',
    '--c-input-bg':     '#fafafa',
    '--c-input-border': '#d1d5db',
    ...SHARED,
  },

  busy: {
    '--c-primary':      '#7c3aed',
    '--c-primary-2':    '#9333ea',
    '--c-accent':       '#ec4899',
    '--c-accent-light': '#fdf2f8',
    '--c-header-from':  '#7c3aed',
    '--c-header-to':    '#ec4899',
    '--c-text':         '#1c1917',
    '--c-muted':        '#6b7280',
    '--c-bg':           '#fdf4ff',
    '--c-card':         '#ffffff',
    '--c-border':       '#e879f9',
    '--c-input-bg':     '#fdf2f8',
    '--c-input-border': '#f0abfc',
    ...SHARED,
  },

  cold: {
    '--c-primary':      '#0369a1',
    '--c-primary-2':    '#0284c7',
    '--c-accent':       '#0ea5e9',
    '--c-accent-light': '#f0f9ff',
    '--c-header-from':  '#0369a1',
    '--c-header-to':    '#0284c7',
    '--c-text':         '#0c4a6e',
    '--c-muted':        '#64748b',
    '--c-bg':           '#e0f2fe',
    '--c-card':         '#ffffff',
    '--c-border':       '#bae6fd',
    '--c-input-bg':     '#f0f9ff',
    '--c-input-border': '#bae6fd',
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
