import { useState, useMemo } from 'react';
import { WEEKS } from '../constants';
import { fmtDate, fmtDayHeader, calcWeekSummary, calcTopCategories } from '../lib/finance';
import { useHouseholdContext } from '../context/HouseholdContext';
import { Chip, cardStyle } from '../components/ui';
import { WeeklySummaryCard } from '../components/layout/WeeklySummaryCard';
import { CategoryBreakdown } from '../components/layout/CategoryBreakdown';

export function LogView({ txs, remaining }) {
  const { fmt } = useHouseholdContext();
  const [typeFilter, setTypeFilter] = useState('All');
  const [weekFilter, setWeekFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('');
  const today = new Date().toISOString().split('T')[0];

  const filtered = useMemo(() => txs.filter(t => {
    if (typeFilter !== 'All' && t.type !== typeFilter) return false;
    if (dateFilter) return t.date === dateFilter;
    if (weekFilter !== 'All' && t.week !== weekFilter) return false;
    return true;
  }), [txs, typeFilter, weekFilter, dateFilter]);

  const grouped = useMemo(() => {
    const g = {};
    filtered.forEach(tx => { if (!g[tx.date]) g[tx.date] = []; g[tx.date].push(tx); });
    return Object.entries(g).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const summary   = useMemo(() => calcWeekSummary(txs, weekFilter), [txs, weekFilter]);
  const categories = useMemo(() => calcTopCategories(filtered), [filtered]);
  const weekLabel  = weekFilter === 'All' ? 'All Weeks' : weekFilter;

  const dayTotals = (dayTxs) => ({
    spent:  dayTxs.filter(t => t.type === 'Expense').reduce((s, t) => s + t.amount, 0),
    income: dayTxs.filter(t => t.type === 'Income').reduce((s, t) => s + t.amount, 0),
  });

  const topCat  = categories[0];
  const insight = topCat ? topCat.category + ' is your highest spending category (' + String(topCat.pct) + '% of spend)' : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontWeight: 900, fontSize: 18, color: 'var(--c-text, #1c1917)', margin: 0 }}>Transaction Log</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 2 }}>
          {['All', 'Income', 'Expense'].map(t => (
            <Chip key={t} label={t} active={typeFilter === t} onClick={() => { setTypeFilter(t); setDateFilter(''); }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 2 }}>
          {['All', ...WEEKS].map(w => (
            <Chip key={w} label={w} active={weekFilter === w && !dateFilter} onClick={() => { setWeekFilter(w); setDateFilter(''); }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="date" value={dateFilter} max={today}
            onChange={e => { setDateFilter(e.target.value); setWeekFilter('All'); }}
            style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: '1.5px solid var(--c-input-border, #e5e7eb)', fontSize: 13, fontWeight: 600, color: 'var(--c-text, #1c1917)', background: 'var(--c-input-bg, #f9fafb)', outline: 'none' }} />
          {dateFilter && (
            <button onClick={() => setDateFilter('')}
              style={{ padding: '9px 14px', borderRadius: 10, border: 'none', background: '#fee2e2', color: '#dc2626', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>
              Clear
            </button>
          )}
        </div>
      </div>

      <WeeklySummaryCard summary={summary} weekLabel={weekLabel} fmt={fmt} />

      {insight && (
        <div style={{ ...cardStyle, background: 'var(--c-accent-light, #f0fdf4)', padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 16 }}>💡</span>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text, #1c1917)', margin: 0 }}>{insight}</p>
        </div>
      )}

      {remaining !== undefined && (
        <div style={{ ...cardStyle, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-muted, #6b7280)', margin: 0 }}>Monthly Remaining</p>
          <p style={{ fontSize: 15, fontWeight: 900, color: remaining >= 0 ? '#059669' : '#dc2626', margin: 0 }}>{fmt(remaining)}</p>
        </div>
      )}

      <CategoryBreakdown categories={categories} fmt={fmt} />

      <p style={{ fontSize: 12, color: 'var(--c-muted, #9ca3af)', margin: 0 }}>{filtered.length} transaction{filtered.length !== 1 ? 's' : ''}</p>

      {filtered.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '32px 16px' }}>
          <p style={{ fontSize: 28, margin: '0 0 8px' }}>🔍</p>
          <p style={{ color: 'var(--c-muted, #9ca3af)', fontSize: 13, margin: 0 }}>No transactions recorded for {weekLabel} yet.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {grouped.map(([date, dayTxs]) => {
            const { spent, income } = dayTotals(dayTxs);
            return (
              <div key={date}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--c-muted, #6b7280)', margin: 0 }}>{fmtDayHeader(date)}</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {income > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: '#059669' }}>+{fmt(income)}</span>}
                    {spent  > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: '#dc2626' }}>-{fmt(spent)}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {dayTxs.map(tx => (
                    <div key={tx.id} style={{ ...cardStyle, padding: '11px 14px', borderRadius: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: tx.type === 'Income' ? '#d1fae5' : '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: tx.type === 'Income' ? '#059669' : '#dc2626' }}>
                        {tx.type === 'Income' ? '↑' : '↓'}
                      </div>
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--c-text, #1c1917)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{tx.category}</p>
                          <p style={{ fontSize: 14, fontWeight: 900, color: tx.type === 'Income' ? '#059669' : 'var(--c-text, #1c1917)', margin: 0, flexShrink: 0 }}>{tx.type === 'Income' ? '+' : '-'}{fmt(tx.amount)}</p>
                        </div>
                        {tx.description && <p style={{ fontSize: 11, color: 'var(--c-muted, #9ca3af)', margin: '1px 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description}</p>}
                        <div style={{ display: 'flex', gap: 5 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--c-border, #f3f4f6)', color: 'var(--c-muted, #6b7280)', padding: '1px 7px', borderRadius: 10 }}>{tx.week}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--c-border, #f3f4f6)', color: 'var(--c-muted, #6b7280)', padding: '1px 7px', borderRadius: 10 }}>{fmtDate(tx.date)}</span>
                          {tx.source === 'guest_portal' && <span style={{ fontSize: 10, fontWeight: 700, background: '#dbeafe', color: '#1d4ed8', padding: '1px 7px', borderRadius: 10 }}>🔑 {tx.submittedBy || tx.loggedBy}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
