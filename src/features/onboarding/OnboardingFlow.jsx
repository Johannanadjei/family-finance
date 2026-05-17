/**
 * OnboardingFlow.jsx
 *
 * Orchestrates the 5-step household setup flow.
 * Manages draft persistence — saves after every step, restores on return.
 * Clears draft only after successful household creation.
 */

import { useState } from 'react';
import { StepHousehold }     from './steps/StepHousehold';
import { StepIncome }        from './steps/StepIncome';
import { StepIncomeSources } from './steps/StepIncomeSources';
import { StepCategories }    from './steps/StepCategories';
import { StepComplete }      from './steps/StepComplete';
import { createHousehold }          from '../../services/households.service';
import { bulkAddBudgetCategories }  from '../../services/categories.service';
import { addIncomeSource }          from '../../services/incomes.service';
import { saveDraft, loadDraft, clearDraft, hasDraft } from '../../services/onboarding.service';

const STEPS = ['Household', 'Income', 'Sources', 'Categories', 'Done'];

const INITIAL_DATA = {
  name: '', currency: 'GHS', adults: 2, children: 0,
  monthlyIncome: 0, surplusTarget: 0, incomeSources: [], categories: [],
};

function ProgressBar({ step, total }) {
  const pct = Math.round((step / total) * 100);
  return (
    <div style={{ padding: '16px 24px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <p style={{ fontSize: 11, fontWeight: 800, color: '#6ee7b7', margin: 0 }}>Step {step} of {total}</p>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.6)', margin: 0 }}>{STEPS[step - 1]}</p>
      </div>
      <div style={{ height: 4, background: 'rgba(255,255,255,.2)', borderRadius: 4 }}>
        <div style={{ height: 4, borderRadius: 4, background: '#6ee7b7', width: String(pct) + '%', transition: 'width .3s' }} />
      </div>
    </div>
  );
}

function ResumeDraftPrompt({ savedAt, onResume, onRestart }) {
  const saved = new Date(savedAt);
  const label = saved.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(145deg,#064e3b,#0d7060)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 24, padding: '32px 24px', width: '100%', maxWidth: 400, textAlign: 'center' }}>
        <p style={{ fontSize: 36, margin: '0 0 12px' }}>📋</p>
        <p style={{ fontWeight: 900, fontSize: 20, margin: '0 0 8px', color: '#1c1917' }}>Resume setup?</p>
        <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 24px' }}>
          Looks like you already started setting up your household budget on {label}. Do you want to continue where you left off?
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={onResume}
            style={{ width: '100%', padding: '14px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#064e3b,#0d7060)', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
            Continue Setup
          </button>
          <button onClick={onRestart}
            style={{ width: '100%', padding: '14px', borderRadius: 14, border: '1.5px solid #e5e7eb', background: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', color: '#6b7280' }}>
            Start Again
          </button>
        </div>
      </div>
    </div>
  );
}

export function OnboardingFlow({ onComplete }) {
  const draft = loadDraft();
  const [showResume, setShowResume] = useState(hasDraft());
  const [step,   setStep]   = useState(draft?.step   || 1);
  const [data,   setData]   = useState(draft?.data   || INITIAL_DATA);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const update = (patch) => setData(prev => ({ ...prev, ...patch }));

  const goNext = (patch) => {
    const next = patch ? { ...data, ...patch } : data;
    if (patch) setData(next);
    const nextStep = step + 1;
    setStep(nextStep);
    saveDraft({ step: nextStep, data: next });
  };

  const goBack = () => {
    const prevStep = step - 1;
    setStep(prevStep);
    saveDraft({ step: prevStep, data });
  };

  const handleComplete = async (finalPatch) => {
    const final = { ...data, ...finalPatch };
    setSaving(true);
    setError('');

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

    if (final.categories.length > 0) {
      await bulkAddBudgetCategories(
        household.id,
        final.categories.map((c, i) => ({ ...c, sort_order: i + 1 }))
      );
    }

    for (const source of final.incomeSources) {
      await addIncomeSource(household.id, source);
    }

    clearDraft();
    setSaving(false);
    onComplete();
  };

  if (showResume && draft) {
    return (
      <ResumeDraftPrompt
        savedAt={draft.savedAt}
        onResume={() => setShowResume(false)}
        onRestart={() => { clearDraft(); setStep(1); setData(INITIAL_DATA); setShowResume(false); }}
      />
    );
  }

  const stepProps = { data, onNext: goNext, onBack: goBack, step };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(145deg,#064e3b,#0d7060)', display: 'flex', flexDirection: 'column' }}>
      <ProgressBar step={step} total={STEPS.length} />
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px 40px' }}>
        <div style={{ background: '#fff', borderRadius: 24, padding: '28px 24px', width: '100%', maxWidth: 440 }}>
          {error && <p style={{ color: '#dc2626', fontSize: 13, fontWeight: 700, marginBottom: 16 }}>{error}</p>}
          {step === 1 && <StepHousehold {...stepProps} />}
          {step === 2 && <StepIncome    {...stepProps} />}
          {step === 3 && <StepIncomeSources {...stepProps} />}
          {step === 4 && <StepCategories   {...stepProps} />}
          {step === 5 && <StepComplete {...stepProps} onSave={handleComplete} saving={saving} />}
        </div>
      </div>
    </div>
  );
}
