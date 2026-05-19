import { useNavigate }            from 'react-router-dom';
import { useBudgetCentreContext } from '../../context/BudgetCentreContext';

export function PaydaySummaryCard({ nextUnpaid, totalReceived, totalExpected }) {
  const { fmt } = useBudgetCentreContext();
  const navigate    = useNavigate();
  const allReceived = totalReceived >= totalExpected && totalExpected > 0;
  return (
    <div style={{ background: 'var(--c-accent-light,#f0fdf4)', borderRadius: 16, padding: '16px 18px', marginBottom: 12, cursor: 'pointer' }} onClick={() => navigate('/payday')}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 800, color: 'var(--c-accent,#059669)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 1 }}>💜 Payday Tracker</p>
          {allReceived ? (
            <p style={{ fontSize: 15, fontWeight: 900, color: 'var(--c-accent,#059669)', margin: 0 }}>All income received ✓</p>
          ) : nextUnpaid ? (
            <>
              <p style={{ fontSize: 22, fontWeight: 900, color: 'var(--c-primary,#064e3b)', margin: '0 0 2px' }}>{fmt(nextUnpaid.expected_amount)}</p>
              <p style={{ fontSize: 12, color: 'var(--c-muted,#6b7280)', margin: 0 }}>{nextUnpaid.label} · {nextUnpaid.daysUntil === 0 ? 'Due today' : nextUnpaid.daysUntil === null ? 'Flexible' : `${nextUnpaid.daysUntil} days away`}</p>
            </>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--c-muted,#6b7280)', margin: 0 }}>No upcoming income</p>
          )}
        </div>
        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-accent,#059669)', margin: 0 }}>View →</p>
      </div>
      <p style={{ fontSize: 11, color: 'var(--c-muted,#6b7280)', margin: '8px 0 0' }}>{fmt(totalReceived)} of {fmt(totalExpected)} received this month</p>
    </div>
  );
}
