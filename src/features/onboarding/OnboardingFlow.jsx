/**
 * features/onboarding/OnboardingFlow.jsx
 *
 * Orchestrates the 5-step onboarding flow.
 * Owns all onboarding state. Only component that writes to Supabase.
 * Each step manages its own field state and calls onNext(data) when valid.
 *
 * Error recovery: centreId is persisted in state after createCentre succeeds.
 * If bulkAddCategories or bulkAddIncomeSources fails, retry skips createCentre.
 *
 * @param {function}    onComplete        — called after all writes succeed
 * @param {string|null} existingCentreId  — set when resuming after partial write
 * @param {'free'|'pro'|null} plan        — the signed-in user's tier, threaded from
 *   App.jsx. This component does NOT resolve it.
 *
 * TIER — why it arrives as a prop
 *   This flow used to fetch its own tier from users.plan, the column the
 *   subscriptions table replaced (see useSubscription). That read returned free for
 *   everyone, so a paying user was onboarded under the FREE caps — 10 categories,
 *   2 income streams — on the very hub they had paid to make bigger, with no way to
 *   tell until after setup. App.jsx already holds the resolved tier; threading it in
 *   deletes the fetch rather than duplicating it (same shape as existingCentreId).
 *
 *   It is the VIEWER's tier (userPlan), not a hub tier: there is no hub yet, and
 *   create_hub/create_category gate on the CALLER — a hub you create is one you will
 *   own. See useHubTier's "NOT for the hub cap" note.
 *
 *   null means UNRESOLVED (still loading, or the fetch failed), never 'free'. Both
 *   capped steps gate on `plan === 'free' && …`, so null renders no cap — a false cap
 *   on a paid account is the bug above, and an uncapped beat on a free one is the
 *   cheaper failure. Same bias as useHubTier. The two caps are NOT equally backed
 *   though: categories are re-checked server-side (create_categories_bulk → CAT01, on
 *   the OWNER's tier), income sources are a plain insert with no server cap today, so
 *   for income this gate is the only enforcement there is.
 */

import { useState, useMemo } from 'react';
import { makeFmt, getCurrentMonth } from '../../lib/finance';
import { getToday }           from '../../lib/dates';
import { currentCalendarMonthRange } from '../../lib/cycles';
import { createCentre }       from '../../services/centres.service';
import { createBudgetPeriod } from '../../services/cycles.service';
import { bulkAddCategories }  from '../../services/categories.service';
import { bulkAddIncomeSources } from '../../services/income.service';
import { STEPS, DEFAULT_CATEGORIES } from './onboarding.constants';
import { OnboardingProgress } from './OnboardingProgress';
import { StepCentre }         from './steps/StepCentre';
import { StepIncome }         from './steps/StepIncome';
import { StepCategories }     from './steps/StepCategories';
import { StepTarget }         from './steps/StepTarget';
import { StepComplete }       from './steps/StepComplete';

export function OnboardingFlow({ onComplete, existingCentreId, plan = null }) {
  const [step,          setStep]          = useState(0);
  const [centreData,    setCentreData]    = useState({ name: '', currency: 'GHS', icon: '🏠' });
  const [incomes,       setIncomes]       = useState([]);
  const [categories,    setCategories]    = useState(
    DEFAULT_CATEGORIES.map(c => ({ ...c, id: crypto.randomUUID() }))
  );
  const [surplusTarget, setSurplusTarget] = useState(0);
  const [centreId,      setCentreId]      = useState(existingCentreId || null);
  const [firstCycleId,  setFirstCycleId]  = useState(null);
  // The first period's start month, kept so the RETRY path (which reuses firstCycleId
  // without recomputing a range) still derives income's month from the cycle.
  const [firstCycleMonth, setFirstCycleMonth] = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState(null);

  const fmt          = useMemo(() => makeFmt(centreData.currency), [centreData.currency]);
  const totalIncome  = useMemo(() => incomes.reduce((s, i) => s + Number(i.expected_amount || 0), 0), [incomes]);
  const totalBudgeted = useMemo(() => categories.reduce((s, c) => s + Number(c.budget_amount || 0), 0), [categories]);
  const overBudget   = totalBudgeted > totalIncome && totalIncome > 0;

  const goBack = () => { setError(null); setStep(s => Math.max(0, s - 1)); };

  const handleCentreNext = (data) => { setCentreData(data); setStep(1); };
  const handleIncomeNext = (data) => { setIncomes(data);    setStep(2); };
  const handleCatsNext   = (data) => { setCategories(data); setStep(3); };
  const handleTargetNext = (data) => { setSurplusTarget(data); setStep(4); };

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);

    let activeCentreId = centreId;

    // Step 1 — create centre only if not already created
    if (!activeCentreId) {
      const { data, error: centreErr } = await createCentre({
        name:           centreData.name,
        currency:       centreData.currency,
        icon:           centreData.icon,
        surplus_target: surplusTarget,
      });
      if (centreErr) {
        setError('We could not create your BOS Hub. Please check your connection and try again.');
        setLoading(false);
        return;
      }
      activeCentreId = data.id;
      setCentreId(activeCentreId);
    }

    // Step 1.5 — create the hub's FIRST budget period BEFORE any period-keyed bulk
    // insert, so categories/income stamp a real cycle_id. Phase B (anchor pivot):
    // a sensible default — the calendar month containing today (Decision Q3) — via the
    // user-driven create_budget_period RPC. The user can edit/replace it later from the
    // Budget screen; onboarding doesn't make them choose. Retry skips this once created.
    let activeCycleId    = firstCycleId;
    let activeCycleMonth = firstCycleMonth;
    if (!activeCycleId) {
      const range = currentCalendarMonthRange(getToday());
      const { data: cycle, error: cycleErr } = await createBudgetPeriod(activeCentreId, {
        name: range.name, startDate: range.start, endDate: range.end,
      });
      if (cycleErr) {
        setError('We could not set up your first budget period. Please try again.');
        setLoading(false);
        return;
      }
      activeCycleId    = cycle.id;
      // Prefer the server row (create_budget_period RETURNS budget_cycles); fall back to
      // the range we asked for. Either way it is the PERIOD's month, never the clock's.
      activeCycleMonth = cycle.start_date?.slice(0, 7) ?? range.start.slice(0, 7);
      setFirstCycleId(activeCycleId);
      setFirstCycleMonth(activeCycleMonth);
    }

    // Step 2 — bulk insert categories, stamped with the first cycle's id
    const categoryRows = categories.map(({ id, ...cat }) => ({
      ...cat,
      month: getCurrentMonth(),
    }));
    const { error: catErr } = await bulkAddCategories(activeCentreId, categoryRows, activeCycleId);
    if (catErr) {
      setError('We could not save your budget categories. Please try again.');
      setLoading(false);
      return;
    }

    // Step 3 — bulk insert income sources, stamped with the first cycle's id
    // month is DERIVED from the period we just created, not from the clock — the
    // cycle is the key, month is the stored label. (catRows above is a separate key path.)
    const incomeRows = incomes.map(({ id, ...income }) => ({ ...income, month: activeCycleMonth }));
    const { error: incomeErr } = await bulkAddIncomeSources(activeCentreId, incomeRows, activeCycleId);
    if (incomeErr) {
      setError('We could not save your income streams. Please try again.');
      setLoading(false);
      return;
    }

    setLoading(false);
    onComplete();
  };

  return (
    <div data-testid="onboarding-flow" style={{
      minHeight: '100vh',
      background: 'linear-gradient(145deg, #064e3b, #0d7060)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '32px 16px 48px',
    }}>
      <div style={{
        background: '#fff', borderRadius: 24, padding: '32px 24px',
        width: '100%', maxWidth: 440,
        boxShadow: '0 24px 64px rgba(0,0,0,.18)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Brand mark — dark variant, sits on the white card */}
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <img src="/icons/bos-icon-v2-192.png" alt="Money B.O.S" style={{ width: 80, height: 80, objectFit: 'contain' }} />
        </div>
        <OnboardingProgress currentStep={step} totalSteps={STEPS.length} steps={STEPS} />

        {/* `plan` is threaded straight through to the two capped steps — this component
            never fetches it. Both gates are written `plan === 'free' && …`, so a null
            (unresolved) tier renders no cap rather than a false one. */}
        {step === 0 && <StepCentre     data={centreData}    onNext={handleCentreNext} />}
        {step === 1 && <StepIncome     data={incomes}       centreCurrency={centreData.currency} plan={plan} onNext={handleIncomeNext} onBack={goBack} />}
        {step === 2 && <StepCategories data={categories}    fmt={fmt} plan={plan} onNext={handleCatsNext}   onBack={goBack} />}
        {step === 3 && <StepTarget     data={surplusTarget} totalIncome={totalIncome} totalBudgeted={totalBudgeted} fmt={fmt} onNext={handleTargetNext} onBack={goBack} />}
        {step === 4 && <StepComplete   centreData={centreData} incomes={incomes} categories={categories} surplusTarget={surplusTarget} totalIncome={totalIncome} totalBudgeted={totalBudgeted} overBudget={overBudget} fmt={fmt} loading={loading} error={error} onConfirm={handleConfirm} onBack={goBack} />}
      </div>
    </div>
  );
}
