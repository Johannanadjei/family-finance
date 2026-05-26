/**
 * lib/themes.js
 *
 * CSS variable token maps for all app skins.
 * applyTheme() sets variables on :root — all components inherit them.
 * Never hardcode hex values in components — always use var(--c-*)
 *
 * Free skin:  family_warmth
 * Pro skins:  global_international, corporate_professional, sunset_warm,
 *             neon_futuristic, dark_executive, minimal_light, royal_luxury,
 *             monochrome
 */

const SHARED = {
  '--c-danger':             '#dc2626',
  '--c-success':            '#059669',
  '--c-warning':            '#d97706',
  '--c-danger-bg':          '#fef2f2',
  '--c-danger-light':       '#fca5a5',
  '--c-success-light':      '#6ee7b7',
  '--c-warning-bg':         '#fef3c7',
  '--c-warning-text':       '#92400e',
  '--c-shadow':             '0 2px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)',
  '--c-success-text':       '#059669',
  '--c-danger-text':        '#dc2626',
  '--c-chip-bg':            '#f3f4f6',
  '--c-chip-text':          '#1c1917',
  '--c-modal-bg':           '#ffffff',
  '--c-btn-text':           '#ffffff',
};

const DARK_FUNCTIONAL = {
  '--c-danger':             '#f87171',
  '--c-success':            '#34d399',
  '--c-warning':            '#fbbf24',
  '--c-danger-bg':          '#450a0a',
  '--c-danger-light':       '#fca5a5',  // bright — used as text on dark gradient headers
  '--c-success-light':      '#6ee7b7',  // bright — used as text on dark gradient headers
  '--c-warning-bg':         '#451a03',
  '--c-warning-text':       '#fcd34d',
  '--c-shadow':             '0 2px 12px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.4)',
  '--c-success-text':       '#34d399',
  '--c-danger-text':        '#f87171',
  '--c-chip-bg':            '#334155',
  '--c-chip-text':          '#f1f5f9',
  '--c-btn-text':           '#ffffff',
};

export const THEMES = {
  family_warmth: {
    '--c-primary':            '#064e3b',
    '--c-primary-2':          '#0d7060',
    '--c-accent':             '#059669',
    '--c-accent-light':       '#f0fdf4',
    '--c-header-from':        '#064e3b',
    '--c-header-to':          '#0d7060',
    '--c-text':               '#1c1917',
    '--c-muted':              '#6b7280',
    '--c-bg':                 '#f3f4f6',
    '--c-card':               '#ffffff',
    '--c-border':             '#e5e7eb',
    '--c-input-bg':           '#f9fafb',
    '--c-input-border':       '#e5e7eb',
    '--c-chip-selected-bg':   '#f0fdf4',
    '--c-chip-selected-text': '#064e3b',
    ...SHARED,
  },

  global_international: {
    '--c-primary':            '#1e3a8a',
    '--c-primary-2':          '#1d4ed8',
    '--c-accent':             '#f59e0b',
    '--c-accent-light':       '#fef3c7',
    '--c-header-from':        '#1e3a8a',
    '--c-header-to':          '#0369a1',
    '--c-text':               '#0f172a',
    '--c-muted':              '#64748b',
    '--c-bg':                 '#f8fafc',
    '--c-card':               '#ffffff',
    '--c-border':             '#e2e8f0',
    '--c-input-bg':           '#f8fafc',
    '--c-input-border':       '#e2e8f0',
    '--c-chip-selected-bg':   '#fef3c7',
    '--c-chip-selected-text': '#1e3a8a',
    ...SHARED,
  },

  corporate_professional: {
    '--c-primary':            '#0f172a',
    '--c-primary-2':          '#1e293b',
    '--c-accent':             '#10b981',
    '--c-accent-light':       '#d1fae5',
    '--c-header-from':        '#0f172a',
    '--c-header-to':          '#1e3a5f',
    '--c-text':               '#0f172a',
    '--c-muted':              '#64748b',
    '--c-bg':                 '#f1f5f9',
    '--c-card':               '#ffffff',
    '--c-border':             '#e2e8f0',
    '--c-input-bg':           '#f8fafc',
    '--c-input-border':       '#e2e8f0',
    '--c-chip-selected-bg':   '#d1fae5',
    '--c-chip-selected-text': '#0f172a',
    ...SHARED,
  },

  sunset_warm: {
    '--c-primary':            '#c2410c',
    '--c-primary-2':          '#ea580c',
    '--c-accent':             '#f59e0b',
    '--c-accent-light':       '#fef3c7',
    '--c-header-from':        '#c2410c',
    '--c-header-to':          '#dc2626',
    '--c-text':               '#1c1917',
    '--c-muted':              '#78716c',
    '--c-bg':                 '#fff7ed',
    '--c-card':               '#ffffff',
    '--c-border':             '#fed7aa',
    '--c-input-bg':           '#fff7ed',
    '--c-input-border':       '#fed7aa',
    '--c-chip-selected-bg':   '#fef3c7',
    '--c-chip-selected-text': '#c2410c',
    ...SHARED,
  },

  neon_futuristic: {
    '--c-primary':            '#7c3aed',
    '--c-primary-2':          '#6d28d9',
    '--c-accent':             '#06b6d4',
    '--c-accent-light':       '#164e63',
    '--c-header-from':        '#1e1b4b',
    '--c-header-to':          '#312e81',
    '--c-text':               '#f8fafc',
    '--c-muted':              '#94a3b8',
    '--c-bg':                 '#0f0f1a',
    '--c-card':               '#1e1b4b',
    '--c-border':             '#312e81',
    '--c-input-bg':           '#1e1b4b',
    '--c-input-border':       '#312e81',
    '--c-chip-selected-bg':   '#7c3aed',
    '--c-chip-selected-text': '#ffffff',
    '--c-modal-bg':           '#1e1b4b',
    ...DARK_FUNCTIONAL,
  },

  dark_executive: {
    '--c-primary':            '#1e40af',
    '--c-primary-2':          '#1d4ed8',
    '--c-accent':             '#06b6d4',
    '--c-accent-light':       '#164e63',
    '--c-header-from':        '#0f172a',
    '--c-header-to':          '#1e293b',
    '--c-text':               '#f1f5f9',
    '--c-muted':              '#94a3b8',
    '--c-bg':                 '#0f172a',
    '--c-card':               '#1e293b',
    '--c-border':             '#334155',
    '--c-input-bg':           '#1e293b',
    '--c-input-border':       '#334155',
    '--c-chip-selected-bg':   '#1e40af',
    '--c-chip-selected-text': '#ffffff',
    '--c-modal-bg':           '#1e293b',
    ...DARK_FUNCTIONAL,
  },

  minimal_light: {
    '--c-primary':            '#111827',
    '--c-primary-2':          '#1f2937',
    '--c-accent':             '#6b7280',
    '--c-accent-light':       '#f3f4f6',
    '--c-header-from':        '#111827',
    '--c-header-to':          '#1f2937',
    '--c-text':               '#111827',
    '--c-muted':              '#6b7280',
    '--c-bg':                 '#ffffff',
    '--c-card':               '#f9fafb',
    '--c-border':             '#e5e7eb',
    '--c-input-bg':           '#ffffff',
    '--c-input-border':       '#e5e7eb',
    '--c-chip-selected-bg':   '#e5e7eb',
    '--c-chip-selected-text': '#111827',
    '--c-modal-bg':           '#f9fafb',
    ...SHARED,
  },

  royal_luxury: {
    '--c-primary':            '#6b21a8',
    '--c-primary-2':          '#7e22ce',
    '--c-accent':             '#d97706',
    '--c-accent-light':       '#fef3c7',
    '--c-header-from':        '#3b0764',
    '--c-header-to':          '#6b21a8',
    '--c-text':               '#1c1917',
    '--c-muted':              '#78716c',
    '--c-bg':                 '#faf5ff',
    '--c-card':               '#ffffff',
    '--c-border':             '#e9d5ff',
    '--c-input-bg':           '#faf5ff',
    '--c-input-border':       '#e9d5ff',
    '--c-chip-selected-bg':   '#fef3c7',
    '--c-chip-selected-text': '#6b21a8',
    ...SHARED,
  },

  panda: {
    '--c-primary':            '#ffffff',
    '--c-primary-2':          '#ffffff',
    '--c-accent':             '#ffffff',
    '--c-accent-light':       '#111111',
    '--c-header-from':        '#000000',
    '--c-header-to':          '#000000',
    '--c-text':               '#ffffff',
    '--c-muted':              '#999999',
    '--c-bg':                 '#000000',
    '--c-card':               '#000000',
    '--c-border':             'rgba(255,255,255,0.12)',
    '--c-input-bg':           '#000000',
    '--c-input-border':       'rgba(255,255,255,0.12)',
    '--c-danger':             '#ffffff',
    '--c-danger-bg':          '#111111',
    '--c-danger-light':       '#fca5a5',  // bright — visible on black header
    '--c-success':            '#ffffff',
    '--c-success-light':      '#6ee7b7',  // bright mint — visible on black header
    '--c-warning':            '#bdbdbd',
    '--c-warning-bg':         '#111111',
    '--c-warning-text':       '#bdbdbd',
    '--c-chip-bg':            '#111111',
    '--c-chip-text':          '#ffffff',
    '--c-chip-selected-bg':   '#ffffff',
    '--c-chip-selected-text': '#000000',
    '--c-modal-bg':           '#000000',
    '--c-active-bg':          '#ffffff',
    '--c-active-text':        '#000000',
    '--c-btn-text':           '#000000',  // black text on white panda buttons
    '--c-shadow':             'none',
  },

  monochrome: {
    '--c-primary':            '#3a3a3a',  // dark — components hardcode #fff text on primary bg
    '--c-primary-2':          '#2d2d2d',
    '--c-accent':             '#ffffff',
    '--c-accent-light':       '#242424',
    '--c-header-from':        '#000000',
    '--c-header-to':          '#1a1a1a',
    '--c-text':               '#e5e5e5',  // near-white — softer than pure #fff
    '--c-muted':              '#9ca3af',
    '--c-bg':                 '#0a0a0a',
    '--c-card':               '#242424',  // lifted from #1a1a1a — distinct against #0a0a0a bg
    '--c-border':             '#3a3a3a',  // visible border on dark surfaces
    '--c-input-bg':           '#111111',
    '--c-input-border':       '#3a3a3a',
    '--c-chip-bg':            '#242424',
    '--c-chip-text':          '#e5e5e5',
    '--c-chip-selected-bg':   '#2a2a2a',  // dark pill — white text on dark bg
    '--c-chip-selected-text': '#ffffff',
    '--c-active-bg':          '#ffffff',  // active hub highlight — white on dark card
    '--c-active-text':        '#000000',  // text inside active-bg elements
    '--c-modal-bg':           '#1a1a1a',
    '--c-danger':             '#fca5a5',
    '--c-danger-bg':          '#1a0a0a',
    '--c-danger-light':       '#fca5a5',  // bright — visible on dark gradient headers
    '--c-success':            '#6ee7b7',
    '--c-success-light':      '#6ee7b7',  // bright mint — visible on dark gradient headers
    '--c-warning':            '#fbbf24',
    '--c-warning-bg':         '#1a1500',
    '--c-warning-text':       '#fef3c7',
    '--c-shadow':             'none',
    '--c-success-text':       '#6ee7b7',
    '--c-danger-text':        '#fca5a5',
    '--c-btn-text':           '#ffffff',
  },
};

/**
 * Resolve which skin to apply for the current member.
 * Standard members always see family_warmth regardless of hub or pref settings.
 * @param {string} role — currentMemberRole
 * @param {string|null} centreSkinId — centre.skin_id
 * @param {string|null} prefThemeSkin — prefs.themeSkin
 * @returns {string} skin key
 */
export const resolveSkin = (role, centreSkinId, prefThemeSkin) => {
  if (role === 'standard') return 'family_warmth';
  return centreSkinId || prefThemeSkin || 'family_warmth';
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
