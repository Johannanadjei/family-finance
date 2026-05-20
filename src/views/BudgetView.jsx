/**
 * views/BudgetView.jsx
 *
 * Budget breakdown — planned vs actual spend per category.
 * Categories sorted by % used descending — most urgent first.
 * All data from FinanceContext and BudgetCentreContext — no new services.
 */

import { useBudgetCentreContext } from '../context/BudgetCentreContext';
import { useFinanceContext }      from '../context/FinanceContext';
import { Skeleton }               from '../components/ui/Skeleton';
import { CategoryBudgetRow }      from './budget/CategoryBudgetRow';

function BudgetViewSkeleton() {
  return (
    <div style={{ padding: '16px 16px 0' }}>
      <div style={{ background: 'var(--c-card,#fff)', borderRadius: 16, padding: '16px 18px', marginBottom: 16 }}>
        <Skeleton width="40%" height={12} borderRadius={6} />
        <div style={{ marginTop: 10, display: 'flex', gap: 16 }}>
          <Skeleton width="45%" height={28} borderRadius={8} />
          <Skeleton width="45%" height={28} borderRadius={8} />
        </div>
      </div>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{ background: 'var(--c-card,#fff)', borderRadius: 12, padding: '14px 16px', marginBottom: 10 }}>
          <Skeleton width="60%" height={12} borderRadius={6} />
          <div style={{ marginTop: 10 }}><Skeleton width="100%" height={6} borderRadius={3} /></div>
          <div style={{ marginTop: 6 }}><Skeleton width="40%" height={10} borderRadius={5} /></div>
        </div>
      ))}
    </div>
  );
}

export function BudgetView() {
  const { categories, fmt } = useBudgetCentreContext();
  const { categorySpend, fixedTotal, fixedSpent, loading, error } = useFinanceContext();

  if (loading) return <BudgetViewSkeleton />;

  const rows = categories
    .map(cat => {
      const spent     = categorySpend[cat.name] || 0;
      const remaining = cat.budget_amount - spent;
      const pctUsed   = cat.budget_amount > 0
        ? Math.min(100, Math.round((spent / cat.budget_amount) * 100))
        : 0;
      return { ...cat, spent, remaining, pctUsed, overBudget: spent > cat.budget_amount };
    })
    .sort((a, b) => b.pctUsed - a.pctUsed);

  return (
    <div style={{ padding: '16px 16px 0' }}>

      {/* Summary header */}
      <div style={{ background: 'linear-gradient(135deg, var(--c-header-from,#064e3b), var(--c-header-to,#0d7060))', borderRadius: 16, padding: '16px 18px', marginBottom: 16, color: '#fff' }}>
        <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: 'rgba(255,255,255,.7)', margin: '0 0 12px', textTransform: 'uppercase' }}>
          Budget Overview
        </p>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', margin: '0 0 2px' }}>Planned</p>
            <p data-testid="budget-total-planned" style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>{fmt(fixedTotal)}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', margin: '0 0 2px' }}>Spent</p>
            <p data-testid="budget-total-spent" style={{ fontSize: 22, fontWeight: 900, margin: 0, color: fixedSpent > fixedTotal ? '#fca5a5' : '#6ee7b7' }}>{fmt(fixedSpent)}</p>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div style={{ background: '#fef2f2', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-danger, #dc2626)', margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Category list */}
      {categories.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <p style={{ fontSize: 32, margin: '0 0 8px' }}>📋</p>
          <p style={{ fontSize: 14, color: 'var(--c-muted, #9ca3af)', fontWeight: 700 }}>No budget categories set up yet.</p>
        </div>
      ) : (
        <div style={{ background: 'var(--c-card, #fff)', borderRadius: 16, padding: '0 16px' }}>
          {rows.map((row, idx) => (
            <CategoryBudgetRow
              key={row.id}
              category={row}
              spent={row.spent}
              remaining={row.remaining}
              pctUsed={row.pctUsed}
              overBudget={row.overBudget}
              fmt={fmt}
            />
          ))}
        </div>
      )}
    </div>
  );
}
