import { useNavigate }            from 'react-router-dom';
import { useBudgetCentreContext } from '../../context/BudgetCentreContext';

export function RecentActivity({ txs, showIncome = true }) {
  const { fmt } = useBudgetCentreContext();
  const navigate = useNavigate();
  const visible  = showIncome ? txs : txs.filter(tx => tx.type !== 'income');
  const recent   = visible.slice(0, 5);
  return (
    <div style={{ background: 'var(--c-card,#fff)', borderRadius: 16, padding: '16px 18px', marginBottom: 24, boxShadow: 'var(--c-shadow)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <p style={{ fontSize: 14, fontWeight: 900, color: 'var(--c-text,#1c1917)', margin: 0 }}>Recent Activity</p>
        <button onClick={() => navigate('/log')} style={{ background: 'none', border: 'none', fontSize: 12, fontWeight: 700, color: 'var(--c-accent,#059669)', cursor: 'pointer', padding: 0 }}>See all</button>
      </div>
      {recent.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--c-muted,#9ca3af)', margin: 0, textAlign: 'center', padding: '12px 0' }}>No transactions yet — tap + to add your first</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {recent.map(tx => (
            <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--c-text,#1c1917)', margin: '0 0 2px' }}>{tx.category_name}</p>
                <p style={{ fontSize: 11, color: 'var(--c-muted,#9ca3af)', margin: 0 }}>{tx.logged_by_name || 'You'} · {tx.date}</p>
              </div>
              <p style={{ fontSize: 14, fontWeight: 900, color: tx.type === 'income' ? 'var(--c-success,#059669)' : 'var(--c-text,#1c1917)', margin: 0, flexShrink: 0 }}>
                {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
