/**
 * views/home/MonthlyIncomeCard.jsx
 *
 * Primary income card on Home screen.
 * Receives all values as props — no calculations inside.
 * fmt read from BudgetCentreContext.
 * Spare shows spareMoney = allIncome - fixedTotal - variableSpent.
 */

import { useBudgetCentreContext } from '../../context/BudgetCentreContext';

export function MonthlyIncomeCard({ allIncome, totalReceived, monthlyIncome, totalSpent, remaining, spareMoney }) {
  const { fmt }   = useBudgetCentreContext();
  const noIncome  = allIncome === 0;

  const stats = [
    { label: 'Spent',     value: fmt(totalSpent),    color: '#fca5a5'                              },
    { label: 'Money Left', value: fmt(remaining),     color: remaining >= 0 ? '#6ee7b7' : '#fca5a5' },
    { label: 'Spare',     value: fmt(spareMoney),     color: 'rgba(255,255,255,.8)'                 },
  ];

  return (
    <div style={{ background: 'linear-gradient(135deg, var(--c-header-from,#064e3b), var(--c-header-to,#0d7060))', borderRadius: 20, padding: '20px 20px 18px', marginBottom: 12, color: '#fff', boxShadow: 'var(--c-shadow)' }}>
      <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: 'rgba(255,255,255,.7)', margin: '0 0 6px', textTransform: 'uppercase' }}>
        Income Received
      </p>
      <p data-testid="income-received-amount" style={{ fontSize: 36, fontWeight: 900, margin: '0 0 4px', lineHeight: 1, color: noIncome ? 'rgba(255,255,255,.4)' : '#fff' }}>
        {fmt(allIncome)}
      </p>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,.6)', margin: '0 0 16px' }}>
        {noIncome ? 'Log income in Payday or via + button' : `of ${fmt(monthlyIncome)} expected`}
      </p>
      <div style={{ display: 'flex', gap: 0, borderTop: '1px solid rgba(255,255,255,.15)', paddingTop: 14 }}>
        {stats.map(({ label, value, color }) => (
          <div key={label} style={{ flex: 1 }}>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,.6)', margin: '0 0 2px', fontWeight: 600 }}>{label}</p>
            <p style={{ fontSize: 13, fontWeight: 900, color, margin: 0 }}>{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
