/**
 * Skin and colour theme definitions.
 * Each skin defines CSS custom property values.
 * Accent colours are applied on top of any skin.
 *
 * Free tier:   Family skin only
 * Premium:     All 5 skins + all accents
 */

export const SKINS = [
  {
    id:      'family',
    name:    'Family Warmth',
    emoji:   '🏡',
    desc:    'Warm, welcoming and homely',
    free:    true,
    vars: {
      '--c-header-from':   '#064e3b',
      '--c-header-to':     '#0d7060',
      '--c-page':          '#f3f4f6',
      '--c-card':          '#ffffff',
      '--c-card-shadow':   '0 1px 6px rgba(0,0,0,.07)',
      '--c-text':          '#1c1917',
      '--c-muted':         '#9ca3af',
      '--c-input-bg':      '#f9fafb',
      '--c-input-border':  '#e5e7eb',
      '--c-border':        '#f3f4f6',
      '--r-card':          '18px',
      '--r-btn':           '14px',
      '--r-chip':          '20px',
    },
  },
  {
    id:      'minimal',
    name:    'Clean Minimal',
    emoji:   '◻️',
    desc:    'Crisp, clinical, distraction-free',
    free:    false,
    vars: {
      '--c-header-from':   '#18181b',
      '--c-header-to':     '#27272a',
      '--c-page':          '#f8fafc',
      '--c-card':          '#ffffff',
      '--c-card-shadow':   '0 0 0 1px rgba(0,0,0,.06)',
      '--c-text':          '#09090b',
      '--c-muted':         '#71717a',
      '--c-input-bg':      '#f8fafc',
      '--c-input-border':  '#e4e4e7',
      '--c-border':        '#f4f4f5',
      '--r-card':          '8px',
      '--r-btn':           '6px',
      '--r-chip':          '6px',
    },
  },
  {
    id:      'chic',
    name:    'Chic & Elegant',
    emoji:   '✨',
    desc:    'Luxurious, refined and fashionable',
    free:    false,
    vars: {
      '--c-header-from':   '#3b0764',
      '--c-header-to':     '#6d28d9',
      '--c-page':          '#fdf4ff',
      '--c-card':          '#ffffff',
      '--c-card-shadow':   '0 2px 14px rgba(109,40,217,.09)',
      '--c-text':          '#1c1917',
      '--c-muted':         '#a78bfa',
      '--c-input-bg':      '#faf5ff',
      '--c-input-border':  '#ddd6fe',
      '--c-border':        '#ede9fe',
      '--r-card':          '22px',
      '--r-btn':           '18px',
      '--r-chip':          '22px',
    },
  },
  {
    id:      'corporate',
    name:    'Corporate Edge',
    emoji:   '🏢',
    desc:    'Sharp, powerful, boardroom-ready',
    free:    false,
    vars: {
      '--c-header-from':   '#0f172a',
      '--c-header-to':     '#1e3a5f',
      '--c-page':          '#f1f5f9',
      '--c-card':          '#ffffff',
      '--c-card-shadow':   '0 1px 3px rgba(0,0,0,.08)',
      '--c-text':          '#0f172a',
      '--c-muted':         '#64748b',
      '--c-input-bg':      '#f8fafc',
      '--c-input-border':  '#e2e8f0',
      '--c-border':        '#e2e8f0',
      '--r-card':          '10px',
      '--r-btn':           '8px',
      '--r-chip':          '8px',
    },
  },
  {
    id:      'cosy',
    name:    'Cosy Home',
    emoji:   '🧡',
    desc:    'Warm terracotta, earthy and homey',
    free:    false,
    vars: {
      '--c-header-from':   '#7c2d12',
      '--c-header-to':     '#c2410c',
      '--c-page':          '#fff7ed',
      '--c-card':          '#fffbf7',
      '--c-card-shadow':   '0 1px 8px rgba(194,65,12,.08)',
      '--c-text':          '#1c0a00',
      '--c-muted':         '#92400e',
      '--c-input-bg':      '#fff7ed',
      '--c-input-border':  '#fed7aa',
      '--c-border':        '#ffedd5',
      '--r-card':          '20px',
      '--r-btn':           '16px',
      '--r-chip':          '20px',
    },
  },
];

/** Accent colours — applied on top of any skin */
export const ACCENTS = [
  { id: 'amber',    name: 'Amber',      primary: '#f59e0b', dark: '#d97706', light: '#fef3c7', text: '#92400e' },
  { id: 'emerald',  name: 'Emerald',    primary: '#10b981', dark: '#059669', light: '#d1fae5', text: '#065f46' },
  { id: 'indigo',   name: 'Indigo',     primary: '#6366f1', dark: '#4f46e5', light: '#e0e7ff', text: '#3730a3' },
  { id: 'rose',     name: 'Rose',       primary: '#f43f5e', dark: '#e11d48', light: '#ffe4e6', text: '#9f1239' },
  { id: 'sky',      name: 'Sky',        primary: '#0ea5e9', dark: '#0284c7', light: '#e0f2fe', text: '#0369a1' },
  { id: 'violet',   name: 'Violet',     primary: '#8b5cf6', dark: '#7c3aed', light: '#ede9fe', text: '#5b21b6' },
  { id: 'orange',   name: 'Orange',     primary: '#f97316', dark: '#ea580c', light: '#ffedd5', text: '#9a3412' },
  { id: 'teal',     name: 'Teal',       primary: '#14b8a6', dark: '#0d9488', light: '#ccfbf1', text: '#0f766e' },
];

export const DEFAULT_THEME = { skinId: 'family', accentId: 'amber' };
