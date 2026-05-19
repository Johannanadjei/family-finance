import { useBudgetCentreContext } from '../../context/BudgetCentreContext';

export function MonthlyIncomeCard({ totalReceived, monthlyIncome, totalSpent, remaining }) {
  const { fmt }     = useBudgetCentreContext();
  const noneReceived = totalReceived === 0;
  return (
    <div style={{ background: 'linear-gradient(135deg, var(--c-header-from, #064e3b), var(--c-header-to, #0d7060))', borderRadius: 20, padding: '20px 20px 18px', marginBottom: 12, color: '#fff' }}>
      <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: 'rgba(255,255,255,.7)', margin: '0 0 6px', textTransform: 'uppercase' }}>Income Received</p>
      <p data-testid="income-received-amount" style={{ fontSize: 36, fontWeight: 900, margin: '0 0 4px', lineHeight: 1, color: noneReceived ? 'rgba(255,255,255,.4)' : '#fff' }}>
        {fmt(totalReceived)}
      </p>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,.6)', margin: '0 0 16px' }}>
        {noneReceived ? 'Confirm income in Payday screen' : `of ${fmt(monthlyIncome)} expected`}
      </p>
      <div style={{ display: 'flex', gap: 0, borderTop: '1px solid rgba(255,255,255,.15)', paddingTop: 14 }}>
        {[
          { label: 'Spent',     value: fmt(totalSpent),  color: '#fca5a5' },
          { label: 'Remaining', value: fmt(remaining),   color: remaining >= 0 ? '#6ee7b7' : '#fca5a5' },
          { label: 'Target',    value: fmt(monthlyIncome - totalSpent), color: 'rgba(255,255,255,.8)' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ flex: 1 }}>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,.6)', margin: '0 0 2px', fontWeight: 600 }}>{label}</p>
            <p style={{ fontSize: 13, fontWeight: 900, color, margin: 0 }}>{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
