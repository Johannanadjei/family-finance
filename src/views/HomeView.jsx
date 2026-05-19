/**
 * views/HomeView.jsx
 *
 * Home dashboard — thin orchestrator.
 * Receives financeValues as props from App.jsx.
 * Formats all values before passing to StatCard.
 * Sub-components live in src/views/home/
 */

import { useState }               from 'react';
import { useBudgetCentreContext } from '../context/BudgetCentreContext';
import { Skeleton }               from '../components/ui/Skeleton';
import { MonthlyIncomeCard }      from './home/MonthlyIncomeCard';
import { BudgetHealthBar }        from './home/BudgetHealthBar';
import { PaydaySummaryCard }      from './home/PaydaySummaryCard';
import { StatCard }               from './home/StatCard';
import { RecentActivity }         from './home/RecentActivity';

function HomeViewSkeleton() {
  const card = { background: 'var(--c-card,#fff)', borderRadius: 16, padding: '16px 18px', marginBottom: 12 };
  return (
    <div style={{ padding: '16px 16px 0' }}>
      <div style={{ ...card, marginBottom: 12 }}>
        <Skeleton width="40%" height={12} borderRadius={6} />
        <div style={{ marginTop: 10 }}><Skeleton width="60%" height={32} borderRadius={8} /></div>
        <div style={{ marginTop: 8, display: 'flex', gap: 12 }}>
          <Skeleton width="30%" height={12} borderRadius={6} />
          <Skeleton width="30%" height={12} borderRadius={6} />
          <Skeleton width="30%" height={12} borderRadius={6} />
        </div>
      </div>
      <div style={{ ...card }}><Skeleton width="100%" height={12} borderRadius={6} /></div>
      <div style={{ ...card }}>
        <Skeleton width="50%" height={12} borderRadius={6} />
        <div style={{ marginTop: 10 }}><Skeleton width="40%" height={28} borderRadius={8} /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        {[0,1,2,3].map(i => <div key={i} style={{ ...card, margin: 0 }}><Skeleton width="60%" height={10} borderRadius={5} /><div style={{ marginTop: 8 }}><Skeleton width="80%" height={20} borderRadius={6} /></div></div>)}
      </div>
      <div style={{ ...card }}>
        <Skeleton width="40%" height={12} borderRadius={6} />
        {[0,1,2].map(i => <div key={i} style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between' }}><Skeleton width="40%" height={12} borderRadius={6} /><Skeleton width="20%" height={12} borderRadius={6} /></div>)}
      </div>
    </div>
  );
}

export function HomeView({ financeValues }) {
  const { fmt }         = useBudgetCentreContext();
  const [activeInfo, setActiveInfo] = useState(null);

  if (financeValues.loading) return <HomeViewSkeleton />;

  const {
    totalReceived, monthlyIncome, totalSpent, remaining,
    healthPct, budgetStatus, nextUnpaid, totalExpected,
    fixedTotal, variableSpent, surplusLeft, surplusTarget, txs,
  } = financeValues;

  const surplusKnown = totalReceived > 0;

  return (
    <div style={{ padding: '16px 16px 0' }}>
      <MonthlyIncomeCard
        totalReceived={totalReceived}
        monthlyIncome={monthlyIncome}
        totalSpent={totalSpent}
        remaining={remaining}
        surplusTarget={surplusTarget}
      />
      <BudgetHealthBar healthPct={healthPct} budgetStatus={budgetStatus} />
      <PaydaySummaryCard
        nextUnpaid={nextUnpaid}
        totalReceived={totalReceived}
        totalExpected={totalExpected}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <StatCard
          label="Fixed Budget"
          value={fmt(fixedTotal)}
          infoKey="fixed"
          activeInfo={activeInfo}
          onInfo={setActiveInfo}
        />
        <StatCard
          label="Income In"
          value={fmt(totalReceived)}
          infoKey="income"
          activeInfo={activeInfo}
          onInfo={setActiveInfo}
          color="var(--c-success,#059669)"
        />
        <StatCard
          label="Variable Spent"
          value={fmt(variableSpent)}
          infoKey="variable"
          activeInfo={activeInfo}
          onInfo={setActiveInfo}
          color={variableSpent > 0 ? 'var(--c-danger,#dc2626)' : undefined}
        />
        <StatCard
          label="Surplus Left"
          value={surplusKnown ? fmt(surplusLeft) : '—'}
          subtitle={surplusKnown ? null : 'Confirm income first'}
          infoKey="surplus"
          activeInfo={activeInfo}
          onInfo={setActiveInfo}
          color="var(--c-warning,#d97706)"
        />
      </div>
      <RecentActivity txs={txs} />
    </div>
  );
}
