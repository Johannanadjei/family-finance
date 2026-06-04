/**
 * views/HomeView.jsx
 *
 * Home dashboard — thin orchestrator.
 * Receives financeValues as props from App.jsx.
 * Formats all values before passing to StatCard.
 * Sub-components live in src/views/home/
 */

import { useState, useEffect }    from 'react';
import { useNavigate }            from 'react-router-dom';
import { useBudgetCentreContext } from '../context/BudgetCentreContext';
import { useFinanceContext }      from '../context/FinanceContext';
import { getCurrentMonth }        from '../lib/finance';
import { formatMonth }            from '../lib/dates';
import { AccessBlocked }         from '../components/ui/AccessBlocked';
import { Skeleton }               from '../components/ui/Skeleton';
import { NoCurrentPeriodPrompt }  from '../components/NoCurrentPeriodPrompt';
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
      <div style={{ ...card, padding: '20px 20px 18px', marginBottom: 12 }}>
        <Skeleton width="40%" height={12} borderRadius={6} />
        <div style={{ marginTop: 10 }}><Skeleton width="55%" height={40} borderRadius={8} /></div>
        <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
          <Skeleton width="50%" height={58} borderRadius={12} />
          <Skeleton width="50%" height={58} borderRadius={12} />
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
  const navigate        = useNavigate();
  const [activeInfo, setActiveInfo] = useState(null);

  const {
    totalReceived, monthlyIncome, totalSpent, allIncome,
    healthPct, budgetStatus, nextUnpaid, totalExpected,
    fixedTotal, spareMoney, budgetRemaining, txs,
    loading, cyclesLoading, activeCycle, activeCycleId, loadCycle, cycles = [],
  } = financeValues;

  // Home is the "now" dashboard — snap the shared period selection back to the
  // current cycle when the loaded data has drifted (e.g. another view navigated to a
  // past cycle). This mount-reset is INTENTIONAL design — Home's role IS the current
  // period — NOT the Commit-0 band-aid (which masked an inability to render other
  // periods). It gates on activeCycleId — the TRUTH of which cycle's transactions are
  // loaded (set only by explicit navigation in Payday/Daily/Log/Budget), not the
  // activeMonth proxy that the loadCycle→loadMonth bridge derives. The `activeCycleId &&`
  // truthiness guard means a null selection (no nav yet, already following the current
  // cycle) never fires — which also avoids the null→id redundant load() the gated loader
  // would otherwise re-trigger. See docs/engineering-decisions.md (proxy-vs-truth drift).
  useEffect(() => {
    if (activeCycle && activeCycleId && activeCycleId !== activeCycle.id) {
      loadCycle(activeCycle.id);
    }
  }, [activeCycle?.id, activeCycleId]);

  // Hold the first paint until cycles resolve — rendering now would flash
  // NoCurrentPeriodPrompt + GHS 0 before the current period loads (cold-load flash).
  if (cyclesLoading) return null;
  if (loading) return <HomeViewSkeleton />;

  const showIncome  = can('viewIncome');
  const showBalance = can('viewBalance');

  return (
    <div style={{ padding: '16px' }}>

      {/* Passive prompt — only when no live period covers today; CTA routes to Budget,
          where the period creator lives (the sheet is mounted there, not on Home). */}
      <NoCurrentPeriodPrompt cycles={cycles} onCreate={() => navigate('/budget')} />

      {/* Period label — the current cycle's name, ungated (visible without viewIncome).
          Home always shows "now", so this is the active cycle, never a navigable label. */}
      <div style={{ marginBottom: 16, textAlign: 'center' }}>
        <p data-testid="home-month-label" style={{ fontSize: 16, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: 0 }}>
          {activeCycle?.name ?? formatMonth(getCurrentMonth())}
        </p>
      </div>

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
