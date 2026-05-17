import { useState } from 'react';
import { fmt, fmtDate } from '../lib/finance';

const INFO = {
  fixed:    { title: 'Fixed Budget',    body: 'The total of all your planned monthly expenses across your 19 budget categories — rent, school fees, food, utilities and more. This is what you have committed to spending each month.' },
  income:   { title: 'Income In',       body: 'The total salary and income payments you have actually received so far this month. As each payday is marked received on the Payday screen, this number grows.' },
  variable: { title: 'Variable Spent',  body: 'Spending on categories outside your 19 fixed budget categories — things like entertainment, gifts, or one-off purchases. Keep this low to protect your surplus.' },
  surplus:  { title: 'Surplus Left',    body: 'What remains after your fixed budget and variable spending are subtracted from your monthly income. Your target surplus is GHS 4,630 — money to save or invest.' },
};

function InfoModal({ item, onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0 16px 32px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 20, padding: '28px 24px', width: '100%', maxWidth: 440 }}>
        <p style={{ fontWeight: 800, fontSize: 18, margin: '0 0 10px', color: '#1c1917' }}>{item.title}</p>
        <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6, margin: '0 0 20px' }}>{item.body}</p>
        <button onClick={onClose} style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#064e3b,#0d7060)', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>Got it</button>
      </div>
    </div>
  );
}

function InfoIcon({ onClick }) {
  return (
    <span onClick={e => { e.stopPropagation(); onClick(); }} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', background: '#e5e7eb', color: '#6b7280', fontSize: 11, fontWeight: 800, cursor: 'pointer', marginLeft: 6, flexShrink: 0 }}>i</span>
  );
}

export function HomeView({ totalIncome, totalSpent, remaining, healthPct, budgetStatus, txs, availableNow, nextUnpaid, totalExpected, totalReceived, variableSpent, surplusLeft, onGoPayday }) {
  const [modal, setModal] = useState(null);

  const recentTxs = [...txs].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8);

  const healthColor = healthPct > 50 ? '#f59e0b' : healthPct > 20 ? '#f97316' : '#ef4444';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {modal && <InfoModal item={INFO[modal]} onClose={() => setModal(null)} />}

      <div style={{ background: 'linear-gradient(135deg,#064e3b,#0d9060)', borderRadius: 20, padding: '24px 20px', color: '#fff' }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, opacity: .7, margin: '0 0 4px' }}>MONTHLY INCOME</p>
        <p style={{ fontSize: 36, fontWeight: 900, margin: '0 0 16px' }}>{fmt(totalIncome)}</p>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div><p style={{ fontSize: 11, opacity: .7, margin: '0 0 2px' }}>Spent</p><p style={{ fontWeight: 800, margin: 0 }}>{fmt(totalSpent)}</p></div>
          <div><p style={{ fontSize: 11, opacity: .7, margin: '0 0 2px' }}>Remaining</p><p style={{ fontWeight: 800, margin: 0 }}>{fmt(remaining)}</p></div>
          <div><p style={{ fontSize: 11, opacity: .7, margin: '0 0 2px' }}>Target</p><p style={{ fontWeight: 800, margin: 0 }}>{fmt(4630)}</p></div>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 16, padding: '18px 16px', boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <p style={{ fontWeight: 800, fontSize: 15, margin: 0 }}>Budget Health</p>
          <span style={{ fontWeight: 800, fontSize: 13, color: healthPct > 30 ? '#16a34a' : '#ef4444' }}>{budgetStatus} {healthPct > 30 ? '🎯' : '⚠️'}</span>
        </div>
        <div style={{ height: 8, background: '#f3f4f6', borderRadius: 8 }}>
          <div style={{ height: 8, borderRadius: 8, background: healthColor, width: String(Math.min(healthPct, 100)) + '%', transition: 'width .4s' }} />
        </div>
        <p style={{ fontSize: 12, color: '#9ca3af', margin: '8px 0 0' }}>{String(Math.round(healthPct))}% of monthly budget remaining</p>
      </div>

      <div onClick={onGoPayday} style={{ background: '#fff', borderRadius: 16, padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,.06)', borderLeft: '4px solid #7c3aed', cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', letterSpacing: 1, margin: '0 0 4px' }}>💜 PAYDAY TRACKER</p>
            <p style={{ fontSize: 28, fontWeight: 900, color: availableNow > 0 ? '#16a34a' : '#ef4444', margin: '0 0 2px' }}>{fmt(availableNow)}</p>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>available right now</p>
          </div>
          {nextUnpaid && (
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 11, color: '#9ca3af', margin: '0 0 2px' }}>Next payday</p>
              <p style={{ fontSize: 22, fontWeight: 900, color: '#f59e0b', margin: '0 0 2px' }}>{nextUnpaid.daysUntil}d</p>
              <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{nextUnpaid.label}</p>
            </div>
          )}
        </div>
        <div style={{ marginTop: 10, height: 4, background: '#f3f4f6', borderRadius: 4 }}>
          <div style={{ height: 4, borderRadius: 4, background: '#7c3aed', width: String(totalExpected > 0 ? Math.round((totalReceived / totalExpected) * 100) : 0) + '%' }} />
        </div>
        <p style={{ fontSize: 12, color: '#9ca3af', margin: '6px 0 0' }}>{fmt(totalReceived)} of {fmt(totalExpected)} received this month</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>Fixed Budget</p>
            <InfoIcon onClick={() => setModal('fixed')} />
          </div>
          <p style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>{fmt(40370)}</p>
        </div>
        <div style={{ background: '#fff', borderRadius: 16, padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>Income In</p>
            <InfoIcon onClick={() => setModal('income')} />
          </div>
          <p style={{ fontSize: 20, fontWeight: 900, color: '#16a34a', margin: 0 }}>{fmt(totalReceived)}</p>
        </div>
        <div style={{ background: '#fff', borderRadius: 16, padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>Variable Spent</p>
            <InfoIcon onClick={() => setModal('variable')} />
          </div>
          <p style={{ fontSize: 20, fontWeight: 900, color: variableSpent > 0 ? '#ef4444' : '#1c1917', margin: 0 }}>{fmt(variableSpent)}</p>
        </div>
        <div style={{ background: '#fff', borderRadius: 16, padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>Surplus Left</p>
            <InfoIcon onClick={() => setModal('surplus')} />
          </div>
          <p style={{ fontSize: 20, fontWeight: 900, color: '#f59e0b', margin: 0 }}>{fmt(surplusLeft)}</p>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 16, padding: '18px 16px', boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
        <p style={{ fontWeight: 800, fontSize: 15, margin: '0 0 14px' }}>Recent Activity</p>
        {recentTxs.length === 0 && <p style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>No transactions yet</p>}
        {recentTxs.map(tx => (
          <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: tx.type === 'Income' ? '#dcfce7' : '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 14, color: tx.type === 'Income' ? '#16a34a' : '#ef4444', fontWeight: 900 }}>{tx.type === 'Income' ? '↑' : '↓'}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: 700, fontSize: 14, margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tx.category}</p>
              <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>{tx.description || tx.category} · {fmtDate(tx.date)}</p>
            </div>
            <p style={{ fontWeight: 800, fontSize: 14, color: tx.type === 'Income' ? '#16a34a' : '#ef4444', margin: 0, flexShrink: 0 }}>{tx.type === 'Income' ? '+' : '-'}{fmt(tx.amount)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
