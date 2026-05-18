import { useMemo } from 'react';
import { useHouseholdContext } from '../context/HouseholdContext';
import { fmtDate, fmtDayHeader } from '../lib/finance';
import { cardStyle } from '../components/ui';

export function DailyView({ txs, spendByDay }) {
  const { fmt, getCatIcon } = useHouseholdContext();

  const grouped = useMemo(() => {
    const g = {};
    txs
      .filter(t => t.type === 'Expense')
      .forEach(t => { if (!g[t.date]) g[t.date] = []; g[t.date].push(t); });
    return Object.entries(g).sort((a, b) => b[0].localeCompare(a[0]));
  }, [txs]);

  if (!grouped.length) {
    return (
      <div style={{ ...cardStyle, textAlign: 'center', padding: '40px 20px' }}>
        <p style={{ fontSize: 28, margin: '0 0 8px' }}>📅</p>
        <p style={{ fontWeight: 800, fontSize: 15, color: '#1c1917', margin: '0 0 4px' }}>No expenses yet</p>
        <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>Your daily spending will appear here.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontWeight: 900, fontSize: 18, color: '#1c1917', margin: 0 }}>Daily View</p>

      {grouped.map(([date, dayTxs]) => {
        const dayTotal = dayTxs.reduce((s, t) => s + t.amount, 0);
        return (
          <div key={date}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <p style={{ fontSize: 12, fontWeight: 800, color: '#6b7280', margin: 0 }}>{fmtDayHeader(date)}</p>
              <p style={{ fontSize: 12, fontWeight: 800, color: '#dc2626', margin: 0 }}>-{fmt(dayTotal)}</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {dayTxs.map(tx => (
                <div key={tx.id} style={{ ...cardStyle, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                    {getCatIcon(tx.category)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 700, fontSize: 14, color: '#1c1917', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tx.category}
                    </p>
                    {tx.description && (
                      <p style={{ fontSize: 11, color: '#9ca3af', margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tx.description}
                      </p>
                    )}
                  </div>
                  <p style={{ fontWeight: 800, fontSize: 14, color: '#1c1917', margin: 0, flexShrink: 0 }}>
                    -{fmt(tx.amount)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
