import { FIXED_EXPENSES } from '../constants';
import { fmt, calcTotalFixed } from '../lib/finance';
import { ProgressBar, cardStyle, heroStyle } from '../components/ui';

export function BudgetView({ catSpend }) {
  const totalFixed = calcTotalFixed();
  const totalSpent = Object.values(catSpend).reduce((s, v) => s + v, 0);
  const overCount  = FIXED_EXPENSES.filter(e => (catSpend[e.category] || 0) > e.budget).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Summary hero */}
      <div style={heroStyle}>
        <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: '#6ee7b7', textTransform: 'uppercase', margin: '0 0 10px' }}>Budget Overview</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[['Budget', fmt(totalFixed)], ['Spent', fmt(totalSpent)], ['Overspent', overCount + ' cats']].map(([l, v]) => (
            <div key={l}>
              <p style={{ fontSize: 10, color: '#6ee7b7', margin: 0 }}>{l}</p>
              <p style={{ fontSize: 14, fontWeight: 800, margin: '2px 0 0' }}>{v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Category cards */}
      {FIXED_EXPENSES.map(item => {
        const spent     = catSpend[item.category] || 0;
        const left      = item.budget - spent;
        const pct       = item.budget > 0 ? Math.round((spent / item.budget) * 100) : 0;
        const overspent = left < 0;

        return (
          <div key={item.id} style={{ ...cardStyle, borderLeft: overspent ? '4px solid #ef4444' : '4px solid transparent' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 26, lineHeight: 1, flexShrink: 0 }}>{item.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 800, color: '#1c1917', margin: 0 }}>{item.category}</p>
                    <p style={{ fontSize: 11, color: '#9ca3af', margin: '1px 0 0' }}>{item.notes}</p>
                  </div>
                  {overspent && (
                    <span style={{ fontSize: 11, fontWeight: 800, background: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: 20 }}>Over!</span>
                  )}
                </div>
                <div style={{ marginTop: 10 }}>
                  <ProgressBar pct={pct} overspent={overspent} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11 }}>
                  <span style={{ color: '#6b7280' }}>Spent: <strong style={{ color: '#1c1917' }}>{fmt(spent)}</strong></span>
                  <span style={{ color: '#6b7280' }}>Budget: <strong>{fmt(item.budget)}</strong></span>
                </div>
                <p style={{ fontSize: 11, fontWeight: 800, marginTop: 2, color: overspent ? '#dc2626' : '#059669' }}>
                  {overspent ? fmt(Math.abs(left)) + ' over budget' : fmt(left) + ' remaining'}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
