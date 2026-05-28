/**
 * views/home/StatCard.jsx
 *
 * Pure display component — no business logic, no fmt calls.
 * Receives pre-formatted string value from HomeView.
 * Optional subtitle shown below value (e.g. "Confirm income first").
 * Info tooltip shown when activeInfo matches infoKey.
 *
 * @param {string}      label
 * @param {string}      value      — pre-formatted string, e.g. "GHS 28,000"
 * @param {string}      [subtitle] — optional muted line below value
 * @param {string}      infoKey
 * @param {string}      [color]
 * @param {string|null} activeInfo
 * @param {function}    onInfo
 */

const STAT_INFO = {
  fixed:  'How much of your monthly budget is still unspent. Overspend draws from Spare Money.',
  income: 'Total income from all sources — salary and ad-hoc combined.',
  spare:  "Your income minus your budget — drawn down by overspend or by expenses you mark 'Take from Spare'.",
};

export function StatCard({ label, value, subtitle, infoKey, color, activeInfo, onInfo }) {
  const isActive = activeInfo === infoKey;
  return (
    <div style={{ background: 'var(--c-card,#fff)', borderRadius: 16, padding: '14px 14px', boxShadow: 'var(--c-shadow)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-muted,#6b7280)', margin: 0 }}>{label}</p>
        <button
          onClick={() => onInfo(isActive ? null : infoKey)}
          aria-label={`Info about ${label}`}
          style={{ background: 'none', border: 'none', color: isActive ? 'var(--c-accent,#059669)' : 'var(--c-muted,#9ca3af)', cursor: 'pointer', padding: 0, lineHeight: 1, display: 'flex', alignItems: 'center' }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5"/>
            <rect x="6.25" y="6" width="1.5" height="4" rx=".75" fill="currentColor"/>
            <circle cx="7" cy="4.5" r=".75" fill="currentColor"/>
          </svg>
        </button>
      </div>
      <p style={{ fontSize: 20, fontWeight: 900, color: color || 'var(--c-text,#1c1917)', margin: 0 }}>{value}</p>
      {subtitle && (
        <p style={{ fontSize: 11, color: 'var(--c-muted,#9ca3af)', margin: '4px 0 0', fontWeight: 600 }}>{subtitle}</p>
      )}
      {isActive && (
        <p style={{ fontSize: 11, color: 'var(--c-muted,#6b7280)', margin: '6px 0 0', lineHeight: 1.4, animation: 'fadeIn .15s ease' }}>{STAT_INFO[infoKey]}</p>
      )}
    </div>
  );
}
