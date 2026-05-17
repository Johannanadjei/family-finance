/**
 * StepComplete.jsx
 * Onboarding Step 5 — Summary and confirmation.
 * Shows calculated surplus, confirms all data, calls onSave.
 */

import { fmt } from '../../../lib/finance';

export function StepComplete({ data, onBack, onSave, saving }) {
  const totalBudgeted = data.categories.reduce((s, c) => s + (c.budget_amount || 0), 0);
  const surplus       = data.monthlyIncome - totalBudgeted;
  const surplusTarget = Math.max(0, surplus);

  const handleSave = () => onSave({ surplusTarget });

  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 800, color: '#059669', letterSpacing: 1, margin: '0 0 4px' }}>STEP 5 OF 5</p>
      <p style={{ fontWeight: 900, fontSize: 22, color: '#1c1917', margin: '0 0 4px' }}>Your Household Summary</p>
      <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 20px' }}>Review your setup before we create your dashboard.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>

        <div style={{ background: '#f9fafb', borderRadius: 14, padding: '14px 16px' }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: '#9ca3af', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 1 }}>Household</p>
          <p style={{ fontWeight: 800, fontSize: 16, color: '#1c1917', margin: 0 }}>{data.name}</p>
          <p style={{ fontSize: 12, color: '#6b7280', margin: '2px 0 0' }}>
            {data.adults} adult{data.adults !== 1 ? 's' : ''} · {data.children} child{data.children !== 1 ? 'ren' : ''} · {data.currency}
          </p>
        </div>

        <div style={{ background: '#f9fafb', borderRadius: 14, padding: '14px 16px' }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: '#9ca3af', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 1 }}>Monthly Income</p>
          <p style={{ fontWeight: 800, fontSize: 16, color: '#1c1917', margin: 0 }}>{fmt(data.monthlyIncome)}</p>
          <p style={{ fontSize: 12, color: '#6b7280', margin: '2px 0 0' }}>{data.incomeSources.length} income source{data.incomeSources.length !== 1 ? 's' : ''}</p>
        </div>

        <div style={{ background: '#f9fafb', borderRadius: 14, padding: '14px 16px' }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: '#9ca3af', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 1 }}>Budget Categories</p>
          <p style={{ fontWeight: 800, fontSize: 16, color: '#1c1917', margin: 0 }}>{fmt(totalBudgeted)} allocated</p>
          <p style={{ fontSize: 12, color: '#6b7280', margin: '2px 0 0' }}>{data.categories.length} categories</p>
        </div>

        <div style={{ background: surplus >= 0 ? '#f0fdf4' : '#fef2f2', borderRadius: 14, padding: '14px 16px', border: '1.5px solid ' + (surplus >= 0 ? '#6ee7b7' : '#fca5a5') }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: '#9ca3af', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 1 }}>Monthly Surplus</p>
          <p style={{ fontWeight: 900, fontSize: 20, color: surplus >= 0 ? '#065f46' : '#dc2626', margin: 0 }}>{fmt(surplus)}</p>
          <p style={{ fontSize: 12, color: '#6b7280', margin: '2px 0 0' }}>
            {surplus >= 0 ? 'This becomes your savings and investment target.' : 'Your budget exceeds your income — go back and adjust.'}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onBack} disabled={saving}
          style={{ flex: 1, padding: '14px', borderRadius: 14, border: '1.5px solid #e5e7eb', background: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', color: '#6b7280' }}>
          Back
        </button>
        <button onClick={handleSave} disabled={saving || surplus < 0}
          style={{ flex: 2, padding: '14px', borderRadius: 14, border: 'none', background: saving || surplus < 0 ? '#e5e7eb' : 'linear-gradient(135deg,#064e3b,#0d7060)', color: saving || surplus < 0 ? '#9ca3af' : '#fff', fontWeight: 800, fontSize: 15, cursor: saving || surplus < 0 ? 'not-allowed' : 'pointer' }}>
          {saving ? 'Creating your dashboard...' : 'Launch My Dashboard 🚀'}
        </button>
      </div>
    </div>
  );
}
