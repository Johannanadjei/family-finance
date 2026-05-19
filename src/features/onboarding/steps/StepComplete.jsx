/**
 * features/onboarding/steps/StepComplete.jsx
 *
 * Step 5 — Summary and confirm.
 * Pure display component — no internal state.
 * Shows everything the user set up. Warns if over budget.
 * onConfirm triggers the Supabase writes in OnboardingFlow.
 *
 * @param {CentreData}     centreData
 * @param {IncomeStream[]} incomes
 * @param {Category[]}     categories
 * @param {number}         surplusTarget
 * @param {number}         totalIncome
 * @param {number}         totalBudgeted
 * @param {boolean}        overBudget
 * @param {function}       fmt
 * @param {boolean}        loading
 * @param {string|null}    error
 * @param {function}       onConfirm
 * @param {function}       onBack
 */

export function StepComplete({
  centreData, incomes, categories, surplusTarget,
  totalIncome, totalBudgeted, overBudget,
  fmt, loading, error, onConfirm, onBack,
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <p style={{ fontSize: 22, fontWeight: 900, color: '#064e3b', margin: '0 0 6px' }}>
          Everything looks good?
        </p>
        <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
          Review your setup before we create your budget centre.
        </p>
      </div>

      {/* Centre summary */}
      <div style={{ background: '#f0fdf4', borderRadius: 14, padding: '14px 16px' }}>
        <p style={{ fontSize: 12, fontWeight: 800, color: '#065f46', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 1 }}>Budget Centre</p>
        <p style={{ fontSize: 18, fontWeight: 900, color: '#064e3b', margin: '0 0 2px' }}>
          {centreData.icon} {centreData.name}
        </p>
        <p style={{ fontSize: 13, color: '#059669', margin: 0 }}>{centreData.currency}</p>
      </div>

      {/* Income summary */}
      <div style={{ background: '#f9fafb', borderRadius: 14, padding: '14px 16px' }}>
        <p style={{ fontSize: 12, fontWeight: 800, color: '#6b7280', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>
          Income — {fmt(totalIncome)}/month
        </p>
        {incomes.map(i => (
          <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <p style={{ fontSize: 13, color: '#1c1917', margin: 0 }}>{i.icon} {i.label}</p>
            <p style={{ fontSize: 13, fontWeight: 800, color: '#059669', margin: 0 }}>{fmt(i.expected_amount)}</p>
          </div>
        ))}
      </div>

      {/* Categories summary */}
      <div style={{ background: '#f9fafb', borderRadius: 14, padding: '14px 16px' }}>
        <p style={{ fontSize: 12, fontWeight: 800, color: '#6b7280', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>
          Budget — {fmt(totalBudgeted)}/month
        </p>
        {categories.slice(0, 5).map(c => (
          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <p style={{ fontSize: 13, color: '#1c1917', margin: 0 }}>{c.icon} {c.name}</p>
            <p style={{ fontSize: 13, fontWeight: 800, color: '#1c1917', margin: 0 }}>{fmt(c.budget_amount)}</p>
          </div>
        ))}
        {categories.length > 5 && (
          <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0' }}>+{categories.length - 5} more categories</p>
        )}
      </div>

      {/* Surplus target */}
      <div style={{ background: '#f9fafb', borderRadius: 14, padding: '14px 16px', display: 'flex', justifyContent: 'space-between' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#6b7280', margin: 0 }}>Monthly surplus target</p>
        <p style={{ fontSize: 13, fontWeight: 900, color: '#064e3b', margin: 0 }}>{fmt(surplusTarget)}</p>
      </div>

      {/* Zero budget warning */}
      {categories.filter(c => Number(c.budget_amount) === 0).length > 0 && (
        <div style={{ background: '#fef3c7', borderRadius: 10, padding: '12px 14px' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#92400e', margin: 0 }}>
            ℹ️ {categories.filter(c => Number(c.budget_amount) === 0).length} categories have no budget set. You can update amounts in the Budget screen after setup.
          </p>
        </div>
      )}

      {/* Over budget warning */}
      {overBudget && (
        <div style={{ background: '#fef3c7', borderRadius: 10, padding: '12px 14px' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#92400e', margin: 0 }}>
            ⚠️ Your total budget ({fmt(totalBudgeted)}) exceeds your expected income ({fmt(totalIncome)}). You can adjust this in Settings.
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: '#fef2f2', borderRadius: 10, padding: '12px 14px' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', margin: 0 }}>
            {error} — tap "Create Budget Centre" to try again.
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
        <button onClick={onBack} disabled={loading} style={{ padding: '14px', borderRadius: 12, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', color: '#6b7280', fontFamily: "'Nunito', sans-serif" }}>← Back</button>
        <button onClick={onConfirm} disabled={loading} style={{ padding: '14px', borderRadius: 12, border: 'none', background: loading ? '#e5e7eb' : 'linear-gradient(135deg, #064e3b, #0d7060)', color: loading ? '#9ca3af' : '#fff', fontSize: 14, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: "'Nunito', sans-serif" }}>
          {loading ? 'Creating...' : 'Create Budget Centre 🎉'}
        </button>
      </div>
    </div>
  );
}
