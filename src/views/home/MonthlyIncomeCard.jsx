/**
 * views/home/MonthlyIncomeCard.jsx
 *
 * Primary income hero card on Home screen.
 * Receives all values as props — no calculations inside.
 * fmt read from BudgetCentreContext.
 *
 * Spent / Spare render as tinted mini-cards on the gradient. Negative spare
 * flips the Spare mini-card to a red tint (rgba red overlay — matches the
 * white-overlay convention for on-gradient surfaces; no new tokens).
 */

import { useBudgetCentreContext } from '../../context/BudgetCentreContext';

const WalletIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M21 12V7H5a2 2 0 010-4h14v4"   stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M3 5v14a2 2 0 002 2h16v-5"     stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M18 12a2 2 0 000 4h4v-4h-4z"   stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const PiggyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 13c0-3 3-5 6.5-5H13c3.5 0 6 2.2 6 5 0 1.5-.8 2.9-2 3.8V19h-2.3v-1.2c-1.4.5-3.2.5-4.6 0V19H7.8v-1.4C5.6 16.6 4 15 4 13z"
          stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
    <path d="M10.5 8.3h3.5"                              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M17 9.2c.6-1 .8-2 .6-3-1 .2-1.9.8-2.4 1.7"  stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
    <circle cx="6.3" cy="12.5" r="0.9" fill="currentColor"/>
  </svg>
);

function MiniStat({ icon, label, value, valueColor, cardBg, iconBg, iconColor, testId }) {
  return (
    <div data-testid={`${testId}-card`} style={{ flex: 1, background: cardBg, borderRadius: 14, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: iconBg, color: iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {icon}
        </div>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, color: 'rgba(255,255,255,.6)', margin: 0, textTransform: 'uppercase' }}>{label}</p>
      </div>
      <p data-testid={testId} style={{ fontSize: 19, fontWeight: 800, color: valueColor, margin: 0, lineHeight: 1.1 }}>{value}</p>
    </div>
  );
}

export function MonthlyIncomeCard({ allIncome, totalReceived, monthlyIncome, totalSpent, spareMoney }) {
  const { fmt }       = useBudgetCentreContext();
  const noIncome      = allIncome === 0;
  const spareNegative = spareMoney < 0;

  return (
    <div style={{ background: 'linear-gradient(135deg, var(--c-header-from,#064e3b), var(--c-header-to,#0d7060))', borderRadius: 20, padding: '20px 20px 18px', marginBottom: 12, color: '#fff', boxShadow: 'var(--c-shadow)', border: '1px solid rgba(255,255,255,0.2)' }}>
      <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: 'rgba(255,255,255,.7)', margin: '0 0 6px', textTransform: 'uppercase' }}>
        Income Received
      </p>
      <p data-testid="income-received-amount" style={{ fontSize: 44, fontWeight: 800, margin: '0 0 4px', lineHeight: 1.05, color: noIncome ? 'rgba(255,255,255,.4)' : '#fff' }}>
        {fmt(allIncome)}
      </p>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,.6)', margin: '0 0 16px' }}>
        {noIncome ? 'Log income in Payday or via + button' : `of ${fmt(monthlyIncome)} expected`}
      </p>
      <div style={{ display: 'flex', gap: 10 }}>
        <MiniStat
          testId="stat-spent"
          icon={<WalletIcon />}
          label="Spent"
          value={fmt(totalSpent)}
          valueColor="#fff"
          cardBg="rgba(255,255,255,.08)"
          iconBg="rgba(255,255,255,.14)"
          iconColor="var(--c-danger-light, #fca5a5)"
        />
        <MiniStat
          testId="stat-spare"
          icon={<PiggyIcon />}
          label="Spare"
          value={fmt(spareMoney)}
          valueColor={spareNegative ? 'var(--c-danger-light, #fca5a5)' : '#fff'}
          cardBg={spareNegative ? 'rgba(248,113,113,.12)' : 'rgba(255,255,255,.08)'}
          iconBg={spareNegative ? 'rgba(248,113,113,.18)' : 'rgba(255,255,255,.14)'}
          iconColor={spareNegative ? 'var(--c-danger-light, #fca5a5)' : 'var(--c-success-light, #6ee7b7)'}
        />
      </div>
    </div>
  );
}
