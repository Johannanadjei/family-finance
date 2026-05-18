import { useHouseholdContext } from '../context/HouseholdContext';
import { calcCategorySpentByName } from '../lib/finance';
import { ProgressBar, cardStyle } from '../components/ui';

export function BudgetView({ catSpend }) {
  const { categories, fmt } = useHouseholdContext();

  if (!categories.length) {
    return (
      <div style={{ ...cardStyle, textAlign: 'center', padding: '40px 20px' }}>
        <p style={{ fontSize: 28, margin: '0 0 8px' }}>📋</p>
        <p style={{ fontWeight: 800, fontSize: 15, color: '#1c1917', margin: '0 0 4px' }}>No categories yet</p>
        <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>Your budget categories will appear here after setup.</p>
      </div>
    );
  }

  const overCount = categories.filter(c => (catSpend[c.name] || 0) > (c.budget_amount || 0)).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ fontWeight: 900, fontSize: 18, color: '#1c1917', margin: 0 }}>Budget</p>
        {overCount > 0 && (
          <span style={{ fontSize: 11, fontWeight: 800, background: '#fee2e2', color: '#dc2626', padding: '3px 10px', borderRadius: 20 }}>
            {overCount} over budget
          </span>
        )}
      </div>

      {categories.map(cat => {
        const spent   = catSpend[cat.name] || 0;
        const budget  = cat.budget_amount  || 0;
        const pct     = budget > 0 ? Math.min(Math.round((spent / budget) * 100), 100) : 0;
        const over    = spent > budget && budget > 0;
        const left    = budget - spent;

        return (
          <div key={cat.id || cat.name} style={{ ...cardStyle }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>{cat.icon || '💸'}</span>
                <div>
                  <p style={{ fontWeight: 800, fontSize: 14, color: '#1c1917', margin: 0 }}>{cat.name}</p>
                  <p style={{ fontSize: 11, color: '#9ca3af', margin: '1px 0 0' }}>
                    Budget: {fmt(budget)}
                  </p>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontWeight: 900, fontSize: 15, color: over ? '#dc2626' : '#1c1917', margin: 0 }}>
                  {fmt(spent)}
                </p>
                <p style={{ fontSize: 11, color: over ? '#dc2626' : '#059669', margin: '1px 0 0', fontWeight: 700 }}>
                  {over ? fmt(Math.abs(left)) + ' over' : fmt(left) + ' left'}
                </p>
              </div>
            </div>
            <ProgressBar pct={pct} overspent={over} />
          </div>
        );
      })}
    </div>
  );
}
