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
import { useFinanceContext }      from '../context/FinanceContext';
import { AccessBlocked }         from '../components/ui/AccessBlocked';
import { Skeleton }               from '../components/ui/Skeleton';
import { MonthlyIncomeCard }      from './home/MonthlyIncomeCard';
import { BudgetHealthBar }        from './home/BudgetHealthBar';
import { PaydaySummaryCard }      from './home/PaydaySummaryCard';
import { StatCard }               from './home/StatCard';
import { RecentActivity }         from './home/RecentActivity';

function HomeViewSkeleton() {
  const card = { background: 'var(--c-card,#fff)', borderRadius: 16, padding: '14px 14px', marginBottom: 12 };
  return (
    <div style={{ padding: '16px' }}>
      {/* Hero */}
      <div style={{ ...card, padding: '16px 18px', marginBottom: 12 }}>
        <Skeleton width="40%" height={12} borderRadius={6} />
        <div style={{ marginTop: 10 }}><Skeleton width="60%" height={32} borderRadius={8} /></div>
        <div style={{ marginTop: 8, display: 'flex', gap: 12 }}>
          <Skeleton width="45%" height={12} borderRadius={6} />
          <Skeleton width="45%" height={12} borderRadius={6} />
        </div>
      </div>
      {/* Payday */}
      <div style={{ ...card, padding: '16px 18px' }}>
        <Skeleton width="50%" height={12} borderRadius={6} />
        <div style={{ marginTop: 10 }}><Skeleton width="40%" height={28} borderRadius={8} /></div>
      </div>
      {/* 1×3 stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
        {[0,1,2].map(i => <div key={i} style={{ ...card, margin: 0 }}><Skeleton width="70%" height={10} borderRadius={5} /><div style={{ marginTop: 8 }}><Skeleton width="85%" height={20} borderRadius={6} /></div></div>)}
      </div>
      {/* Budget Health */}
      <div style={{ ...card, padding: '16px 18px' }}><Skeleton width="100%" height={12} borderRadius={6} /></div>
      {/* Recent Activity */}
      <div style={{ ...card, padding: '16px 18px' }}>
        <Skeleton width="40%" height={12} borderRadius={6} />
        {[0,1,2].map(i => <div key={i} style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between' }}><Skeleton width="40%" height={12} borderRadius={6} /><Skeleton width="20%" height={12} borderRadius={6} /></div>)}
      </div>
    </div>
  );
}

export function HomeView() {
  const { fmt, can }    = useBudgetCentreContext();
  const financeValues   = useFinanceContext();
  const [activeInfo, setActiveInfo] = useState(null);

  if (financeValues.loading) return <HomeViewSkeleton />;

  const {
    totalReceived, monthlyIncome, totalSpent, allIncome,
    healthPct, budgetStatus, nextUnpaid, totalExpected,
    fixedTotal, spareMoney, budgetRemaining, txs,
  } = financeValues;

  const showIncome  = can('viewIncome');
  const showBalance = can('viewBalance');

  return (
    <div style={{ padding: '16px' }}>
      {showIncome && (
        <MonthlyIncomeCard
          allIncome={allIncome}
          totalReceived={totalReceived}
          monthlyIncome={monthlyIncome}
          totalSpent={totalSpent}
          spareMoney={spareMoney}
        />
      )}
      {showIncome && (
        <PaydaySummaryCard
          nextUnpaid={nextUnpaid}
          totalReceived={totalReceived}
          totalExpected={totalExpected}
        />
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
        {showIncome && (
          <StatCard
            label="Money In"
            value={fmt(allIncome)}
            infoKey="income"
            activeInfo={activeInfo}
            onInfo={setActiveInfo}
            color="var(--c-success,#059669)"
          />
        )}
        {showBalance && (
          <StatCard
            label="Budget Left"
            value={fmt(budgetRemaining)}
            infoKey="fixed"
            activeInfo={activeInfo}
            onInfo={setActiveInfo}
          />
        )}
        <StatCard
          label="Spare Money"
          value={fmt(spareMoney)}
          infoKey="spare"
          activeInfo={activeInfo}
          onInfo={setActiveInfo}
          color={spareMoney < 0 ? 'var(--c-danger,#dc2626)' : 'var(--c-success,#059669)'}
        />
      </div>
      <BudgetHealthBar healthPct={healthPct} budgetStatus={budgetStatus} totalSpent={totalSpent} fixedTotal={fixedTotal} />
      <RecentActivity txs={txs} showIncome={showIncome} />
    </div>
  );
}
