import { useState } from 'react';
import { fmt, fmtDate, calcTotalFixed } from '../lib/finance';
import { SURPLUS_TARGET } from '../constants';
import { InfoModal, StatCard, heroStyle, cardStyle } from '../components/ui';

const FIXED_TOTAL = calcTotalFixed();

const INFO = {
  fixed:    { title: 'Fixed Budget',   body: 'The total of all your planned monthly expenses across your 19 budget categories — rent, school fees, food, utilities and more.' },
  income:   { title: 'Income In',      body: 'Salary and income payments actually received so far this month. Marked received on the Payday screen.' },
  variable: { title: 'Variable Spent', body: 'Spending outside your 19 fixed categories — gifts, entertainment, one-off purchases. Keep this low to protect your surplus.' },
  surplus:  { title: 'Surplus Left',   body: 'What remains after fixed budget and variable spending are subtracted from income. Your target is ' + fmt(SURPLUS_TARGET) + ' — money to save or invest.' },
};

export function HomeView({ totalIncome, totalSpent, remaining, healthPct, budgetStatus, txs, availableNow, nextUnpaid, totalExpected, totalReceived, variableSpent, surplusLeft, onGoPayday }) {
  const [modal, setModal] = useState(null);
  const recentTxs = [...txs].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8);
  const healthColor = healthPct > 50 ? '#f59e0b' : healthPct > 20 ? '#f97316' : '#ef4444';
  const payPct = totalExpected > 0 ? Math.round((totalReceived / totalExpected) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {modal && <InfoModal item={INFO[modal]} onClose={() => setModal(null)} />}

      <div style={{ ...heroStyle, padding: '24px 20px' }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, opacity: .7, margin: '0 0 4px' }}>MONTHLY INCOME</p>
        <p style={{ fontSize: 36, fontWeight: 900, margin: '0 0 16px' }}>{fmt(totalIncome)}</p>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div><p style={{ fontSize: 11, opacity: .7, margin: '0 0 2px' }}>Spent</p><p style={{ fontWeight: 800, margin: 0 }}>{fmt(totalSpent)}</p></div>
          <div><p style={{ fontSize: 11, opacity: .7, margin: '0 0 2px' }}>Remaining</p><p style={{ fontWeight: 800, margin: 0 }}>{fmt(remaining)}</p></div>
          <div><p style={{ fontSize: 11, opacity: .7, margin: '0 0 2px' }}>Target</p><p style={{ fontWeight: 800, margin: 0 }}>{fmt(SURPLUS_TARGET)}</p></div>
        </div>
      </div>

      <div style={{ ...cardStyle }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <p style={{ fontWeight: 800, fontSize: 15, margin: 0 }}>Budget Health</p>
          <span style={{ fontWeight: 800, fontSize: 13, color: healthPct > 30 ? '#16a34a' : '#ef4444' }}>{budgetStatus} {healthPct > 30 ? '🎯' : '⚠️'}</span>
        </div>
        <div style={{ height: 8, background: 'var(--c-border, #f3f4f6)', borderRadius: 8 }}>
          <div style={{ height: 8, borderRadius: 8, background: healthColor, width: String(Math.min(healthPct, 100)) + '%', transition: 'width .4s' }} />
        </div>
        <p style={{ fontSize: 12, color: 'var(--c-muted, #9ca3af)', margin: '8px 0 0' }}>{String(Math.round(healthPct))}% of monthly budget remaining</p>
      </div>

      <div onClick={onGoPayday} style={{ ...cardStyle, borderLeft: '4px solid #7c3aed', cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', letterSpacing: 1, margin: '0 0 4px' }}>💜 PAYDAY TRACKER</p>
            <p style={{ fontSize: 28, fontWeight: 900, color: availableNow > 0 ? '#16a34a' : '#ef4444', margin: '0 0 2px' }}>{fmt(availableNow)}</p>
            <p style={{ fontSize: 12, color: 'var(--c-muted, #9ca3af)', margin: 0 }}>available right now</p>
          </div>
          {nextUnpaid && (
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 11, color: 'var(--c-muted, #9ca3af)', margin: '0 0 2px' }}>Next payday</p>
              <p style={{ fontSize: 22, fontWeight: 900, color: '#f59e0b', margin: '0 0 2px' }}>{nextUnpaid.daysUntil}d</p>
              <p style={{ fontSize: 11, color: 'var(--c-muted, #9ca3af)', margin: 0 }}>{nextUnpaid.label}</p>
            </div>
          )}
        </div>
        <div style={{ marginTop: 10, height: 4, background: 'var(--c-border, #f3f4f6)', borderRadius: 4 }}>
          <div style={{ height: 4, borderRadius: 4, background: '#7c3aed', width: String(payPct) + '%' }} />
        </div>
        <p style={{ fontSize: 12, color: 'var(--c-muted, #9ca3af)', margin: '6px 0 0' }}>{fmt(totalReceived)} of {fmt(totalExpected)} received this month</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <StatCard label="Fixed Budget"   value={fmt(FIXED_TOTAL)}  infoKey="fixed"    onInfo={setModal} />
        <StatCard label="Income In"      value={fmt(totalReceived)} infoKey="income"   onInfo={setModal} color="#16a34a" />
        <StatCard label="Variable Spent" value={fmt(variableSpent)} infoKey="variable" onInfo={setModal} color={variableSpent > 0 ? '#ef4444' : 'var(--c-text, #1c1917)'} />
        <StatCard label="Surplus Left"   value={fmt(surplusLeft)}   infoKey="surplus"  onInfo={setModal} color="#f59e0b" />
      </div>

      <div style={{ ...cardStyle }}>
        <p style={{ fontWeight: 800, fontSize: 15, margin: '0 0 14px' }}>Recent Activity</p>
        {recentTxs.length === 0 && <p style={{ color: 'var(--c-muted, #9ca3af)', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>No transactions yet</p>}
        {recentTxs.map(tx => (
          <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: tx.type === 'Income' ? '#dcfce7' : '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 14, color: tx.type === 'Income' ? '#16a34a' : '#ef4444', fontWeight: 900 }}>{tx.type === 'Income' ? '↑' : '↓'}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: 700, fontSize: 14, margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tx.category}</p>
              <p style={{ fontSize: 12, color: 'var(--c-muted, #9ca3af)', margin: 0 }}>{tx.description || tx.category} · {fmtDate(tx.date)}</p>
            </div>
            <p style={{ fontWeight: 800, fontSize: 14, color: tx.type === 'Income' ? '#16a34a' : '#ef4444', margin: 0, flexShrink: 0 }}>{tx.type === 'Income' ? '+' : '-'}{fmt(tx.amount)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
