/**
 * Shared style for all <select> elements.
 *
 * Applies cross-browser appearance reset, a custom chevron SVG, and the
 * right padding needed to clear it. The chevron uses stroke="currentColor"
 * so it inherits the select's text color — works in light AND dark skins
 * automatically without hardcoded values.
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
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  backgroundSize: '12px',
};
