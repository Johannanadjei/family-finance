/**
 * views/daily/WeeklySummaryBar.jsx
 *
 * Shows W1–W5 spend tabs for the active month.
 * Current week highlighted when viewing current month.
 * No week highlighted when viewing a past month.
 *
 * @param {WeekData[]} weeklyData   — from useFinanceContext()
 * @param {function}   fmt          — from useBudgetCentreContext()
 * @param {string}     activeMonth  — 'YYYY-MM'
 */

import { getCurrentMonth, getWeekForDate } from '../../lib/finance';

export function WeeklySummaryBar({ weeklyData, fmt, activeMonth }) {
  const isCurrentMonth = activeMonth === getCurrentMonth();
  const currentWeek    = isCurrentMonth
    ? getWeekForDate(new Date().toISOString().split('T')[0])
    : null;

  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
      {weeklyData.map(w => {
        const isActive = w.week === currentWeek;
        return (
          <div
            key={w.week}
            data-testid={`week-tab-${w.week}`}
            data-active={isActive ? 'true' : 'false'}
            style={{
              flex:         '0 0 auto',
              background:   isActive ? 'var(--c-primary, #064e3b)' : 'var(--c-card, #fff)',
              borderRadius: 10,
              padding:      '8px 12px',
              border:       `1.5px solid ${isActive ? 'var(--c-primary, #064e3b)' : 'var(--c-border, #e5e7eb)'}`,
              textAlign:    'center',
              minWidth:     64,
            }}
          >
            <p style={{ fontSize: 10, fontWeight: 800, color: isActive ? '#6ee7b7' : 'var(--c-muted, #6b7280)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 1 }}>
              {w.week}
            </p>
            <p style={{ fontSize: 13, fontWeight: 900, color: isActive ? '#fff' : 'var(--c-text, #1c1917)', margin: 0 }}>
              {fmt(w.variableSpending)}
            </p>
          </div>
        );
      })}
    </div>
  );
}
