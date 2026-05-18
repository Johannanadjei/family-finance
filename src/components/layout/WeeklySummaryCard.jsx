import { cardStyle } from '../ui';

/** Summary card shown at top of LogView — fmt passed from parent */
export function WeeklySummaryCard({ summary, weekLabel, fmt }) {
  const netPositive = summary.net >= 0;
  return (
    <div style={{ ...cardStyle, background: 'linear-gradient(145deg, var(--c-header-from, #064e3b), var(--c-header-to, #0d7060))', color: '#fff', padding: '18px 20px' }}>
      <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, opacity: .7, margin: '0 0 12px' }}>{weekLabel.toUpperCase()} SUMMARY</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <p style={{ fontSize: 11, opacity: .7, margin: '0 0 2px' }}>Expenses</p>
          <p style={{ fontSize: 18, fontWeight: 900, color: '#fca5a5', margin: 0 }}>{fmt(summary.expenses)}</p>
        </div>
        <div>
          <p style={{ fontSize: 11, opacity: .7, margin: '0 0 2px' }}>Income</p>
          <p style={{ fontSize: 18, fontWeight: 900, color: '#6ee7b7', margin: 0 }}>{fmt(summary.income)}</p>
        </div>
      </div>
      <div style={{ borderTop: '1px solid rgba(255,255,255,.2)', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ fontSize: 11, opacity: .7, margin: '0 0 2px' }}>Net Balance</p>
          <p style={{ fontSize: 22, fontWeight: 900, color: netPositive ? '#6ee7b7' : '#fca5a5', margin: 0 }}>{netPositive ? '+' : ''}{fmt(summary.net)}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 11, opacity: .7, margin: '0 0 2px' }}>Transactions</p>
          <p style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>{summary.count}</p>
        </div>
      </div>
    </div>
  );
}
