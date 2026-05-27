/**
 * views/payday/NoIncomeSourcesEmpty.jsx — current-month empty state.
 *
 * Shown on the current month when no income sources are configured yet.
 * Prompts the user to add sources in Settings. Pure display: receives
 * the navigation callback as a prop.
 */

export function NoIncomeSourcesEmpty({ onGoToSettings }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 16px' }}>
      <p style={{ fontSize: 36, margin: '0 0 12px' }}>💜</p>
      <p style={{ fontSize: 16, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: '0 0 6px' }}>
        No income sources set up yet.
      </p>
      <p style={{ fontSize: 15, color: 'var(--c-muted, #6b7280)', margin: '0 0 20px', lineHeight: 1.5 }}>
        Go to Settings to add your salary or income sources.
      </p>
      <button
        onClick={onGoToSettings}
        style={{
          padding: '12px 24px', borderRadius: 12, border: 'none',
          background: 'var(--c-primary, #064e3b)',
          color: 'var(--c-btn-text, #ffffff)', fontSize: 15, fontWeight: 800, cursor: 'pointer',
          fontFamily: "'Nunito', sans-serif",
        }}
      >
        Go to Settings
      </button>
    </div>
  );
}
