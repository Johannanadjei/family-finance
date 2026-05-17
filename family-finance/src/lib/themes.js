/**
 * Theme utility — pure functions, no React, no side effects.
 * Builds a CSS custom property string from a skin + accent combination.
 */

import { SKINS, ACCENTS, DEFAULT_THEME } from '../constants/skins';

/** Look up a skin by id, fallback to default */
export const getSkin = (skinId) =>
  SKINS.find(s => s.id === skinId) || SKINS[0];

/** Look up an accent by id, fallback to default */
export const getAccent = (accentId) =>
  ACCENTS.find(a => a.id === accentId) || ACCENTS[0];

/**
 * Build a CSS string of custom property declarations for :root.
 * Called once on mount and whenever theme changes.
 * Result is injected via dangerouslySetInnerHTML — no template literals.
 */
export const buildThemeCSS = (skinId, accentId) => {
  const skin   = getSkin(skinId);
  const accent = getAccent(accentId);

  const vars = {
    // Skin vars
    ...skin.vars,
    // Accent vars
    '--c-accent':       accent.primary,
    '--c-accent-dark':  accent.dark,
    '--c-accent-light': accent.light,
    '--c-accent-text':  accent.text,
    // Semantic shortcuts used across components
    '--c-nav-active':   accent.primary,
    '--c-fab':          accent.primary,
    '--c-fab-dark':     accent.dark,
    '--c-chip-active':  accent.primary,
    '--c-progress':     accent.primary,
  };

  const declarations = Object.entries(vars)
    .map(([k, v]) => k + ':' + v)
    .join(';');

  return ':root{' + declarations + '}';
};

/** Returns a theme config merged with defaults for missing keys */
export const resolveTheme = (savedTheme) => ({
  skinId:   savedTheme?.skinId   || DEFAULT_THEME.skinId,
  accentId: savedTheme?.accentId || DEFAULT_THEME.accentId,
});
