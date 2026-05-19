const STAT_INFO = {
  fixed:    'Your total planned monthly budget across all categories.',
  income:   'Total income confirmed as received this month.',
  variable: 'Spending outside your planned budget categories.',
  surplus:  'What remains after your fixed budget and variable spending.',
};

export function StatCard({ label, value, infoKey, color, activeInfo, onInfo }) {
  const isActive = activeInfo === infoKey;
  return (
    <div style={{ background: 'var(--c-card,#fff)', borderRadius: 16, padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-muted,#6b7280)', margin: 0 }}>{label}</p>
        <button onClick={() => onInfo(isActive ? null : infoKey)} aria-label={`Info about ${label}`} style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--c-muted,#9ca3af)', cursor: 'pointer', padding: 0, lineHeight: 1 }}>ℹ️</button>
      </div>
      <p style={{ fontSize: 20, fontWeight: 900, color: color || 'var(--c-text,#1c1917)', margin: 0 }}>{value}</p>
      {isActive && <p style={{ fontSize: 11, color: 'var(--c-muted,#6b7280)', margin: '6px 0 0', lineHeight: 1.4 }}>{STAT_INFO[infoKey]}</p>}
    </div>
  );
}
