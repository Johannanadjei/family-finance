/**
 * views/payday/MonthEmptyState.jsx — empty state for past/future Payday months.
 *
 * Mirrors LogView's empty-state visual (64×64 document SVG at 0.3 opacity + text).
 * Pure display: receives title + optional subtitle strings.
 */

export function MonthEmptyState({ title, subtitle }) {
  return (
    <div style={{ textAlign: 'center', padding: '56px 24px 48px' }}>
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true" style={{ margin: '0 auto 16px', display: 'block', opacity: 0.3 }}>
        <rect x="12" y="8" width="40" height="50" rx="4" stroke="var(--c-primary, #064e3b)" strokeWidth="2.5"/>
        <path d="M20 22h24M20 30h24M20 38h16" stroke="var(--c-primary, #064e3b)" strokeWidth="2" strokeLinecap="round"/>
      </svg>
      <p style={{ fontSize: 16, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: '0 0 6px' }}>{title}</p>
      {subtitle && (
        <p style={{ fontSize: 13, color: 'var(--c-muted, #9ca3af)', margin: 0, fontWeight: 600 }}>{subtitle}</p>
      )}
    </div>
  );
}
