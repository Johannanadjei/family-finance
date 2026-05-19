/**
 * components/ui/Skeleton.jsx
 *
 * Animated loading placeholder.
 * Used in views when financeValues.loading is true.
 * No state — pure display.
 *
 * @param {string|number} width
 * @param {string|number} height
 * @param {number} borderRadius
 */

const keyframes = `
@keyframes skeleton-pulse {
  0%   { opacity: 1; }
  50%  { opacity: 0.4; }
  100% { opacity: 1; }
}`;

let styleInjected = false;

export function Skeleton({ width = '100%', height = 16, borderRadius = 8 }) {
  if (!styleInjected) {
    const style = document.createElement('style');
    style.textContent = keyframes;
    document.head.appendChild(style);
    styleInjected = true;
  }

  return (
    <div style={{
      width, height, borderRadius,
      background:      'var(--c-border, #e5e7eb)',
      animation:       'skeleton-pulse 1.5s ease-in-out infinite',
      display:         'block',
      flexShrink:      0,
    }} />
  );
}
