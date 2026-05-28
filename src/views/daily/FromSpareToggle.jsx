/**
 * views/daily/FromSpareToggle.jsx
 *
 * Pill toggle on the AddTransactionSheet that routes an expense to Spare
 * instead of Budget. Pure display — caller owns state.
 */

export function FromSpareToggle({ on, onToggle }) {
  return (
    <button
      type="button"
      data-testid="from-spare-toggle"
      aria-pressed={on}
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px', borderRadius: 10,
        border: `1.5px solid ${on ? 'var(--c-primary, #064e3b)' : 'var(--c-border, #e5e7eb)'}`,
        background: on ? 'var(--c-chip-selected-bg, #f0fdf4)' : 'var(--c-input-bg, #f9fafb)',
        cursor: 'pointer', fontFamily: "'Nunito', sans-serif",
        color: 'var(--c-text, #1c1917)', textAlign: 'left',
      }}
    >
      <div>
        <p style={{ fontSize: 13, fontWeight: 800, margin: 0 }}>Take from Spare Money</p>
        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-muted, #6b7280)', margin: '2px 0 0' }}>(instead of from Budget)</p>
      </div>
      <span
        aria-hidden="true"
        style={{
          width: 36, height: 20, borderRadius: 10, flexShrink: 0,
          background: on ? 'var(--c-primary, #064e3b)' : 'var(--c-border, #e5e7eb)',
          position: 'relative', transition: 'background .15s',
        }}
      >
        <span style={{
          position: 'absolute', top: 2,
          left: on ? 18 : 2,
          width: 16, height: 16, borderRadius: '50%',
          background: '#fff', transition: 'left .15s',
        }} />
      </span>
    </button>
  );
}
