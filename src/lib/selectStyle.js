/**
 * Shared style for all <select> elements.
 *
 * Applies cross-browser appearance reset, a custom chevron, and the right
 * padding needed to clear it.
 *
 * The chevron colour comes from the `--c-chevron` token, which each skin bakes
 * to its own `--c-text` (see `chevron()` in themes.js). This is necessary
 * because a `background-image` SVG cannot be tinted any other way: `currentColor`
 * does not inherit the host element's colour inside a background image, and
 * `var()` does not resolve inside a `url(...)` string. The fallback is a
 * near-black chevron so a skin missing the token still shows one.
 *
 * Usage:
 *   <select style={{ ...inputStyle, ...selectStyle }}>
 *   <select style={{ ...fieldStyle, ...selectStyle }}>
 *   <select style={{ ...inlineStyles, ...selectStyle }}>
 *
 * Always spread selectStyle LAST so its paddingRight overrides any earlier
 * paddingRight from the base style object.
 */
export const selectStyle = {
  appearance: 'none',
  WebkitAppearance: 'none',
  MozAppearance: 'none',
  paddingRight: '36px',
  backgroundImage:
    "var(--c-chevron, url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%231c1917' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\"))",
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  backgroundSize: '12px',
};
