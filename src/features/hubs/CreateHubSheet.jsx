/**
 * features/hubs/CreateHubSheet.jsx
 *
 * Bottom sheet — 4-step flow to create an additional control centre.
 * Steps: Hub Type → Name / Currency → Categories → Confirm
 * Income sources are added later via the Payday screen.
 * On completion calls onComplete(centreId) so App can switch hubs.
 */

import { useState, useMemo } from 'react';
import { selectStyle }           from '../../lib/selectStyle';
import { createCentre }          from '../../services/centres.service';
import { bulkAddCategories }     from '../../services/categories.service';
import { bulkAddIncomeSources }  from '../../services/income.service';
import { StepIncome }            from '../onboarding/steps/StepIncome';
import { getDefaultCategories, getHubType } from '../../lib/hubTypes';
import { makeFmt, getCurrentMonth }          from '../../lib/finance';
import { CURRENCIES }        from '../onboarding/onboarding.constants';
import { StepHubType }       from '../onboarding/steps/StepHubType';
import { StepCategories }    from '../onboarding/steps/StepCategories';

const TOTAL_STEPS = 5;

const inputStyle = {
  width: '100%', padding: '13px 15px', borderRadius: 12,
  border: '1.5px solid var(--c-input-border, #e5e7eb)',
  fontSize: 15, fontWeight: 600, outline: 'none',
  background: 'var(--c-input-bg, #f9fafb)', boxSizing: 'border-box',
  fontFamily: "'Nunito', sans-serif", color: 'var(--c-text, #1c1917)',
};

export function CreateHubSheet({ isOpen, onClose, onComplete }) {
  const [step,       setStep]       = useState(0);
  const [hubType,    setHubType]    = useState(null);
  const [hubName,    setHubName]    = useState('');
  const [currency,   setCurrency]   = useState(CURRENCIES[0].code);
  const [icon,       setIcon]       = useState('🏠');
  const [categories, setCategories] = useState([]);
  const [incomes,    setIncomes]    = useState([]);
  const [nameErr,    setNameErr]    = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);

  const fmt = useMemo(() => makeFmt(currency), [currency]);

  const reset = () => {
    setStep(0); setHubType(null); setHubName(''); setCurrency(CURRENCIES[0].code);
    setIcon('🏠'); setCategories([]); setIncomes([]); setNameErr(null);
    setLoading(false); setError(null);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleTypeNext = (id) => {
    const hub = getHubType(id);
    if (hub) setIcon(hub.icon);
    setCategories(getDefaultCategories(id).map(c => ({ ...c, id: crypto.randomUUID() })));
    setStep(1);
  };

  const handleNameNext = () => {
    if (!hubName.trim()) { setNameErr('Please give your hub a name.'); return; }
    setNameErr(null);
    setStep(2);
  };

  const handleCatsNext   = (data) => { setCategories(data); setStep(3); };
  const handleIncomeNext = (data) => { setIncomes(data);   setStep(4); };

  const handleConfirm = async () => {
    setLoading(true); setError(null);
    const hub = getHubType(hubType);
    const { data, error: centreErr } = await createCentre({
      name: hubName.trim(), currency, icon, surplus_target: 0,
      type: hubType || 'family_home', skin_id: hub?.defaultSkin || null,
    });
    if (centreErr) { setError('Could not create hub. Please try again.'); setLoading(false); return; }

    const catRows = categories.map(({ id: _id, ...c }) => ({ ...c, month: getCurrentMonth() }));
    const { error: catErr } = await bulkAddCategories(data.id, catRows);
    if (catErr) { setError('Could not save categories. Please try again.'); setLoading(false); return; }

    if (incomes.length > 0) {
      const srcRows = incomes.map(({ id: _id, ...src }) => src);
      const { error: incErr } = await bulkAddIncomeSources(data.id, srcRows);
      if (incErr) { setError('Could not save income sources. Please try again.'); setLoading(false); return; }
    }

    setLoading(false);
    reset();
    onComplete(data.id);
  };

  if (!isOpen) return null;

  return (
    <>
      <div onClick={handleClose} aria-hidden="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 500 }} />

      <div role="dialog" aria-modal="true" style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 440, maxHeight: '92vh',
        background: 'var(--c-card, #fff)', borderRadius: '20px 20px 0 0',
        zIndex: 600, display: 'flex', flexDirection: 'column', overflowY: 'auto',
        boxShadow: '0 -8px 40px rgba(0,0,0,.2)',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--c-border, #e5e7eb)', flexShrink: 0 }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 900, color: 'var(--c-primary, #064e3b)', margin: '0 0 1px' }}>New BOS Hub</p>
            <p style={{ fontSize: 11, color: 'var(--c-muted, #6b7280)', margin: 0 }}>Step {step + 1} of {TOTAL_STEPS}</p>
          </div>
          <button onClick={handleClose} aria-label="Close" style={{ background: 'var(--c-bg, #f3f4f6)', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 14, color: 'var(--c-muted, #6b7280)' }}>✕</button>
        </div>

        {/* Step content */}
        <div style={{ padding: '20px 20px 32px', flex: 1 }}>
          {step === 0 && <StepHubType selected={hubType} onSelect={setHubType} onNext={handleTypeNext} />}

          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <p style={{ fontSize: 22, fontWeight: 900, color: 'var(--c-primary, #064e3b)', margin: 0 }}>Name your hub</p>
              <input
                type="text" placeholder="e.g. Our Family Home" value={hubName}
                maxLength={50} autoFocus
                onChange={e => { setHubName(e.target.value); setNameErr(null); }}
                style={inputStyle}
              />
              <select value={currency} onChange={e => setCurrency(e.target.value)} style={{ ...inputStyle, ...selectStyle }}>
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
              {nameErr && <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-danger, #dc2626)', margin: 0 }}>{nameErr}</p>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
                <button onClick={() => setStep(0)} style={{ padding: '14px', borderRadius: 12, border: '1.5px solid var(--c-border, #e5e7eb)', background: 'var(--c-card, #fff)', fontSize: 14, fontWeight: 800, cursor: 'pointer', color: 'var(--c-muted, #6b7280)', fontFamily: "'Nunito', sans-serif" }}>← Back</button>
                <button onClick={handleNameNext} style={{ padding: '14px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, var(--c-primary, #064e3b), var(--c-primary-2, #0d7060))', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}>Continue →</button>
              </div>
            </div>
          )}

          {step === 2 && <StepCategories data={categories} fmt={fmt} onNext={handleCatsNext} onBack={() => setStep(1)} />}

          {step === 3 && (
            <StepIncome
              data={incomes}
              centreCurrency={currency}
              plan="free"
              onNext={handleIncomeNext}
              onBack={() => setStep(2)}
            />
          )}

          {step === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ fontSize: 22, fontWeight: 900, color: 'var(--c-primary, #064e3b)', margin: 0 }}>Ready to create?</p>
              <div style={{ background: 'var(--c-accent-light, #f0fdf4)', borderRadius: 14, padding: '14px 16px' }}>
                <p style={{ fontSize: 20, fontWeight: 900, color: 'var(--c-primary, #064e3b)', margin: '0 0 4px' }}>{icon} {hubName}</p>
                <p style={{ fontSize: 13, color: 'var(--c-accent, #059669)', margin: 0 }}>{currency} · {categories.length} categories{incomes.length > 0 ? ` · ${incomes.length} income source${incomes.length === 1 ? '' : 's'}` : ''}</p>
              </div>
              <p style={{ fontSize: 12, color: 'var(--c-muted, #6b7280)', margin: 0 }}>
                Add income sources from the Payday screen after setup.
              </p>
              {error && <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-danger, #dc2626)', margin: 0 }}>{error}</p>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
                <button onClick={() => setStep(3)} disabled={loading} style={{ padding: '14px', borderRadius: 12, border: '1.5px solid var(--c-border, #e5e7eb)', background: 'var(--c-card, #fff)', fontSize: 14, fontWeight: 800, cursor: 'pointer', color: 'var(--c-muted, #6b7280)', fontFamily: "'Nunito', sans-serif" }}>← Back</button>
                <button onClick={handleConfirm} disabled={loading} style={{ padding: '14px', borderRadius: 12, border: 'none', background: loading ? 'var(--c-border)' : 'linear-gradient(135deg, var(--c-primary, #064e3b), var(--c-primary-2, #0d7060))', color: loading ? 'var(--c-muted)' : '#fff', fontSize: 14, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: "'Nunito', sans-serif" }}>
                  {loading ? 'Creating...' : 'Create Hub 🎉'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
