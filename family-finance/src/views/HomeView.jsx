import { HOUSEHOLD } from '../data/mockData';
import { calcTotalFixed, fmt, fmtDate, calcDaysUntil } from '../lib/finance';
import { ProgressBar, cardStyle, heroStyle } from '../components/ui';

export function HomeView({ totalIncome, totalSpent, remaining, healthPct, budgetStatus, txs, availableNow, nextUnpaid, totalExpected, totalReceived, variableSpent, surplusLeft, onGoPayday }) {
  const totalFixed  = calcTotalFixed();
  const receivedPct = totalExpected > 0 ? Math.round((totalReceived / totalExpected) * 100) : 0;
  const daysToNext  = nextUnpaid ? calcDaysUntil(nextUnpaid.expectedPayDay) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Monthly income hero */}
      <div style={heroStyle}>
        <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: '#6ee7b7', textTransform: 'uppercase', margin: 0 }}>Monthly Income</p>
        <p style={{ fontSize: 36, fontWeight: 900, margin: '4px 0 0', lineHeight: 1 }}>{fmt(HOUSEHOLD.monthlyIncome)}</p>
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.15)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[['Spent', fmt(totalSpent)], ['Remaining', fmt(remaining)], ['Target', fmt(HOUSEHOLD.surplusTarget)]].map(([l, v]) => (
            <div key={l}>
              <p style={{ fontSize: 10, color: '#6ee7b7', margin: 0 }}>{l}</p>
              <p style={{ fontSize: 14, fontWeight: 800, margin: '2px 0 0' }}>{v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Budget health */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <p style={{ fontWeight: 800, fontSize: 14, color: '#1c1917', margin: 0 }}>Budget Health</p>
          <span style={{ fontSize: 12, fontWeight: 800, color: budgetStatus.color }}>{budgetStatus.label}</span>
        </div>
        <ProgressBar pct={healthPct} overspent={remaining < 0} />
        <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>{healthPct}% of monthly budget remaining</p>
      </div>

      {/* Payday pulse — tappable shortcut to Payday tab */}
      <button onClick={onGoPayday}
        style={{ ...cardStyle, textAlign: 'left', border: 'none', cursor: 'pointer', width: '100%', borderLeft: '4px solid #4f46e5', padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 10, fontWeight: 800, color: '#4f46e5', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: 1 }}>
              💜 Payday Tracker
            </p>
            <p style={{ fontSize: 26, fontWeight: 900, color: availableNow < 0 ? '#dc2626' : '#1e1b4b', margin: '0 0 2px' }}>
              {fmt(Math.max(0, availableNow))}
            </p>
            <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>available right now</p>
          </div>
          {nextUnpaid && (
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <p style={{ fontSize: 10, color: '#9ca3af', margin: '0 0 2px' }}>Next payday</p>
              <p style={{ fontSize: 20, fontWeight: 900, color: '#d97706', margin: 0 }}>
                {daysToNext === 0 ? 'Today!' : daysToNext === 1 ? 'Tomorrow!' : daysToNext + 'd'}
              </p>
              <p style={{ fontSize: 10, color: '#9ca3af', margin: '1px 0 0' }}>{nextUnpaid.source}</p>
            </div>
          )}
        </div>
        {totalExpected > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ background: '#e0e7ff', borderRadius: 6, height: 5, overflow: 'hidden' }}>
              <div style={{ width: String(receivedPct) + '%', height: '100%', background: '#4f46e5', borderRadius: 6 }} />
            </div>
            <p style={{ fontSize: 10, color: '#6b7280', margin: '3px 0 0' }}>
              {fmt(totalReceived)} of {fmt(totalExpected)} received this month
            </p>
          </div>
        )}
      </button>

      {/* Quick stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {[
          { label: 'Fixed Budget',    value: fmt(totalFixed),    color: '#1c1917' },
          { label: 'Income In',       value: fmt(totalIncome),   color: '#059669' },
          { label: 'Variable Spent',  value: fmt(variableSpent), color: '#dc2626' },
          { label: 'Surplus Left',    value: fmt(Math.max(0, surplusLeft)), color: surplusLeft >= 0 ? '#d97706' : '#dc2626' },
        ].map(({ label, value, color }) => (
          <div key={label} style={cardStyle}>
            <p style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700, margin: 0 }}>{label}</p>
            <p style={{ fontSize: 19, fontWeight: 900, color, margin: '4px 0 0' }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Recent activity */}
      <div style={cardStyle}>
        <p style={{ fontWeight: 800, fontSize: 14, color: '#1c1917', margin: '0 0 14px' }}>Recent Activity</p>
        {txs.length === 0 ? (
          <p style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>
            No transactions yet. Tap + to add one!
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {txs.slice(0, 6).map(tx => (
              <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: tx.type === 'Income' ? '#d1fae5' : '#fee2e2',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 900, color: tx.type === 'Income' ? '#059669' : '#dc2626',
                }}>
                  {tx.type === 'Income' ? '↑' : '↓'}
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <p style={{ fontSize: 13, fontWeight: 800, color: '#1c1917', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.category}</p>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 2 }}>
                    <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{tx.description || tx.week} · {fmtDate(tx.date)}</p>
                    {tx.source === 'guest_portal' && (
                      <span style={{ fontSize: 10, fontWeight: 800, background: '#dbeafe', color: '#1d4ed8', padding: '0px 6px', borderRadius: 8 }}>
                        🔑 {tx.submittedBy || tx.loggedBy}
                      </span>
                    )}
                  </div>
                </div>
                <p style={{ fontSize: 13, fontWeight: 800, color: tx.type === 'Income' ? '#059669' : '#1c1917', flexShrink: 0 }}>
                  {tx.type === 'Income' ? '+' : '-'}{fmt(tx.amount)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
