import { useState, useMemo } from 'react';
import { FIXED_EXPENSES } from '../constants';
import { fmt, fmtDayHeader, calcSpendByDay } from '../lib/finance';
import { cardStyle } from '../components/ui';

export function DailyView({ txs, spendByDay }) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(todayStr);

  // Last 14 days for the bar strip
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (13 - i));
    return d.toISOString().split('T')[0];
  });

  const maxSpend = Math.max(...last14.map(d => spendByDay[d] || 0), 1);

  const dayTxs    = useMemo(() => txs.filter(t => t.date === selectedDate), [txs, selectedDate]);
  const daySpent  = dayTxs.filter(t => t.type === 'Expense').reduce((s, t) => s + t.amount, 0);
  const dayIncome = dayTxs.filter(t => t.type === 'Income').reduce((s, t) => s + t.amount, 0);

  const catBreakdown = useMemo(() => {
    const m = {};
    dayTxs.filter(t => t.type === 'Expense').forEach(t => { m[t.category] = (m[t.category] || 0) + t.amount; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [dayTxs]);

  const getCatIcon = (cat) => FIXED_EXPENSES.find(c => c.category === cat)?.icon || '💸';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Hero */}
      <div style={{ background: 'linear-gradient(145deg,#7c3aed,#4f46e5)', borderRadius: 20, padding: '20px', color: '#fff' }}>
        <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: 3, color: '#c4b5fd', textTransform: 'uppercase', margin: '0 0 4px' }}>Daily Tracker</p>
        <p style={{ fontSize: 24, fontWeight: 900, margin: '0 0 2px' }}>{fmtDayHeader(selectedDate)}</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12 }}>
          {[['Spent', fmt(daySpent)], ['Income', fmt(dayIncome)], ['Entries', dayTxs.length + ' txns']].map(([l, v]) => (
            <div key={l} style={{ background: 'rgba(255,255,255,.12)', borderRadius: 10, padding: '8px 10px' }}>
              <p style={{ fontSize: 9, color: '#c4b5fd', margin: 0 }}>{l}</p>
              <p style={{ fontSize: 13, fontWeight: 900, margin: '2px 0 0' }}>{v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Date picker */}
      <div style={cardStyle}>
        <p style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 1 }}>Pick a date</p>
        <input
          type="date"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          max={todayStr}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, fontWeight: 600, color: '#1c1917', background: '#f9fafb', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      {/* 14-day bar strip */}
      <div style={cardStyle}>
        <p style={{ fontWeight: 800, fontSize: 13, color: '#1c1917', margin: '0 0 10px' }}>Last 14 days</p>
        <div style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 4 }}>
          {last14.map(d => {
            const spend  = spendByDay[d] || 0;
            const active = d === selectedDate;
            const barH   = spend ? Math.max(6, Math.round((spend / maxSpend) * 36)) : 4;
            const dt     = new Date(d + 'T00:00:00');
            const isT    = d === todayStr;
            return (
              <button key={d} onClick={() => setSelectedDate(d)}
                style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '6px 5px', borderRadius: 10, width: 42, cursor: 'pointer', background: active ? '#4f46e5' : 'transparent', border: 'none' }}>
                <p style={{ fontSize: 9, fontWeight: 700, color: active ? '#c4b5fd' : isT ? '#7c3aed' : '#9ca3af', margin: 0 }}>
                  {dt.toLocaleDateString('en-GH', { weekday: 'short' }).slice(0, 2)}
                </p>
                <div style={{ width: 26, height: 44, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                  <div style={{ width: 18, height: barH, borderRadius: 4, background: active ? 'rgba(255,255,255,.5)' : spend > 0 ? '#7c3aed' : '#e5e7eb' }} />
                </div>
                <p style={{ fontSize: 11, fontWeight: 800, color: active ? '#fff' : isT ? '#4f46e5' : '#374151', margin: 0 }}>
                  {dt.getDate()}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Day transactions */}
      <p style={{ fontWeight: 800, fontSize: 14, color: '#1c1917', margin: '2px 0 0' }}>
        {fmtDayHeader(selectedDate)}'s Transactions
      </p>

      {dayTxs.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <p style={{ fontSize: 28, margin: '8px 0 4px' }}>🌿</p>
          <p style={{ color: '#9ca3af', fontSize: 14, fontWeight: 700, margin: 0 }}>Nothing logged this day</p>
          <p style={{ color: '#d1d5db', fontSize: 12, margin: '4px 0 0' }}>Tap + to add a payment</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {dayTxs.map(tx => (
            <div key={tx.id} style={{ ...cardStyle, borderRadius: 14, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: tx.type === 'Income' ? '#d1fae5' : '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                {getCatIcon(tx.category)}
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <p style={{ fontSize: 13, fontWeight: 800, color: '#1c1917', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.category}</p>
                {tx.description && <p style={{ fontSize: 11, color: '#9ca3af', margin: '1px 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description}</p>}
                <span style={{ fontSize: 10, fontWeight: 700, background: '#f3f4f6', color: '#6b7280', padding: '1px 7px', borderRadius: 8 }}>{tx.week}</span>
              </div>
              <p style={{ fontSize: 14, fontWeight: 900, color: tx.type === 'Income' ? '#059669' : '#1c1917', flexShrink: 0 }}>
                {tx.type === 'Income' ? '+' : '-'}{fmt(tx.amount)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Category breakdown */}
      {catBreakdown.length > 0 && (
        <div style={cardStyle}>
          <p style={{ fontWeight: 800, fontSize: 13, color: '#1c1917', margin: '0 0 12px' }}>Where it went</p>
          {catBreakdown.map(([cat, amt]) => {
            const pct = daySpent ? Math.round((amt / daySpent) * 100) : 0;
            return (
              <div key={cat} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', margin: 0 }}>{getCatIcon(cat)} {cat}</p>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#7c3aed' }}>{fmt(amt)} · {pct}%</span>
                </div>
                <div style={{ background: '#f3f4f6', borderRadius: 6, height: 6, overflow: 'hidden' }}>
                  <div style={{ width: String(pct) + '%', height: '100%', background: '#7c3aed', borderRadius: 6 }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
