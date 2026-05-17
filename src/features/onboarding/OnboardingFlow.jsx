/**
 * OnboardingFlow.jsx
 *
 * Orchestrates the 5-step household setup flow for new users.
 * Manages accumulated form state across steps.
 * Calls services layer on completion — never calls Supabase directly.
 *
 * ARCHITECTURE:
 *   App.jsx renders this when needsOnboarding is true.
 *   On completion, calls onComplete() which triggers useHousehold to re-fetch.
 *   Each step receives { data, onNext, onBack } props only.
 */

import { useState } from 'react';
import { StepHousehold }      from './steps/StepHousehold';
import { StepIncome }         from './steps/StepIncome';
import { StepIncomeSources }  from './steps/StepIncomeSources';
import { StepCategories }     from './steps/StepCategories';
import { StepComplete }       from './steps/StepComplete';
import { createHousehold }         from '../../services/households.service';
import { bulkAddBudgetCategories } from '../../services/categories.service';
import { addIncomeSource }         from '../../services/incomes.service';

const STEPS = ['Household', 'Income', 'Sources', 'Categories', 'Done'];

const INITIAL_DATA = {
  name:           '',
  currency:       'GHS',
  adults:         2,
  children:       0,
  monthlyIncome:  0,
  surplusTarget:  0,
  incomeSources:  [],
  categories:     [],
};

function ProgressBar({ step, total }) {
  const pct = Math.round(((step) / total) * 100);
  return (
    <div style={{ padding: '16px 24px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <p style={{ fontSize: 11, fontWeight: 800, color: '#6ee7b7', margin: 0 }}>
          Step {step} of {total}
        </p>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.6)', margin: 0 }}>
          {STEPS[step - 1]}
        </p>
      </div>
      <div style={{ height: 4, background: 'rgba(255,255,255,.2)', borderRadius: 4 }}>
        <div style={{ height: 4, borderRadius: 4, background: '#6ee7b7', width: String(pct) + '%', transition: 'width .3s' }} />
      </div>
    </div>
  );
}

export function OnboardingFlow({ onComplete }) {
  const [step, setStep]   = useState(1);
  const [data, setData]   = useState(INITIAL_DATA);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const update  = (patch) => setData(prev => ({ ...prev, ...patch }));
  const goNext  = (patch) => { if (patch) update(patch); setStep(s => s + 1); };
  const goBack  = () => setStep(s => s - 1);

  const handleComplete = async (finalPatch) => {
    const final = { ...data, ...finalPatch };
    setSaving(true);
    setError('');

    // Step 1: Create household
    const { data: household, error: householdErr } = await createHousehold({
      name:           final.name,
      currency:       final.currency,
      monthly_income: final.monthlyIncome,
      surplus_target: final.surplusTarget,
      adults_count:   final.adults,
      children_count: final.children,
    });

    if (householdErr) {
      setError('Could not create household. Please try again.');
      setSaving(false);
      return;
    }

    // Step 2: Bulk insert categories
    if (final.categories.length > 0) {
      const { error: catErr } = await bulkAddBudgetCategories(
        household.id,
        final.categories.map((c, i) => ({ ...c, sort_order: i + 1 }))
      );
      if (catErr) console.warn('[Onboarding] Category insert error:', catErr.message);
    }

    // Step 3: Insert income sources
    for (const source of final.incomeSources) {
      const { error: incErr } = await addIncomeSource(household.id, source);
      if (incErr) console.warn('[Onboarding] Income source insert error:', incErr.message);
    }

    setSaving(false);
    onComplete();
  };

  const props = { data, onNext: goNext, onBack: goBack };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(145deg,#064e3b,#0d7060)', display: 'flex', flexDirection: 'column' }}>
      <ProgressBar step={step} total={STEPS.length} />
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px 40px' }}>
        <div style={{ background: '#fff', borderRadius: 24, padding: '28px 24px', width: '100%', maxWidth: 440 }}>
          {error && <p style={{ color: '#dc2626', fontSize: 13, fontWeight: 700, marginBottom: 16 }}>{error}</p>}
          {step === 1 && <StepHousehold {...props} />}
          {step === 2 && <StepIncome    {...props} />}
          {step === 3 && <StepIncomeSources {...props} />}
          {step === 4 && <StepCategories   {...props} />}
          {step === 5 && <StepComplete {...props} onSave={handleComplete} saving={saving} />}
        </div>
      </div>
    </div>
  );
}
