/**
 * components/PeriodSetupPrompt.jsx — the single budget-month banner.
 *
 * ONE MOUNT, in DashboardShell (App.jsx), above the routed view. It used to be
 * NoCurrentPeriodPrompt mounted twice — HomeView and BudgetView — so the Home →
 * Budget journey showed the same warning twice. Mounting it in the shell means every
 * view gets the signal and nobody duplicates the rule.
 *
 * THREE STATES, resolved in this order:
 *
 *   A. RECEIPT — `autoPeriod` is set, i.e. auto-continue CREATED a month this session.
 *      Strictly created===true: the hook only sets autoPeriod on that branch, so a
 *      created===false result (a racer got there first) shows nothing. Neutral card,
 *      not the warning border — nothing is wrong, we are telling the user what we did
 *      on their behalf. Dismissable, and the dismissal persists per hub+month.
 *
 *   B. SETUP — no month covers today and the viewer may create one. Auto-continue is
 *      off (standard member promoted mid-session), failed, or never ran (offline).
 *      One tap runs the SAME server write auto-continue would have — so the month is
 *      clipped to the real gap and the previous month's budget still carries over —
 *      with "Choose different dates" as a quiet link to the custom creator.
 *
 *   C. ASK — no month covers today and the viewer cannot create one. No button; a
 *      standard member's only route is the owner. Telling them to "create a period"
 *      when the server will refuse them is the worst of the three failures.
 *
 * Renders null when a month covers today and there is no receipt, and while cycles
 * are still loading — the shell has no cyclesLoading gate of its own, so this
 * component owns that hold or the setup CTA flashes before the month resolves.
 *
 * Self-contained by design: it reads both contexts and does its own routing, so the
 * shell mount is a single line and no view has to re-derive the visibility rule.
 * Custom dates ask for the creator via router state — the sheet's open flag is lifted
 * into BudgetView, so this banner cannot raise it directly.
 *
 * Takes no props.
 */

import { useState } from 'react';
import { useNavigate }            from 'react-router-dom';
import { useBudgetCentreContext } from '../context/BudgetCentreContext';
import { useFinanceContext }      from '../context/FinanceContext';
import { cycleForToday }          from '../lib/cycles';
import { getToday, formatMonth }  from '../lib/dates';
import { isPeriodReceiptDismissed, dismissPeriodReceipt } from '../lib/storage';

// Owns its own outer spacing: it renders directly in the shell, above the routed
// view's own 16px box, so the margin lives here rather than in a wrapper.
const card = {
  background: 'var(--c-card, #fff)', borderRadius: 16, padding: '16px 18px',
  margin: '16px 16px 0', boxShadow: 'var(--c-shadow)',
};
const title = { fontSize: 15, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: '0 0 4px' };
const body  = { fontSize: 13, color: 'var(--c-muted, #6b7280)', margin: '0 0 14px', lineHeight: 1.5 };
const primaryBtn = {
  width: '100%', padding: '12px', borderRadius: 12, border: 'none',
  background: 'var(--c-primary, #064e3b)', color: 'var(--c-btn-text, #fff)',
  fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif",
};
const linkBtn = {
  display: 'block', width: '100%', marginTop: 10, padding: 0, background: 'none',
  border: 'none', color: 'var(--c-muted, #6b7280)', fontSize: 12, fontWeight: 700,
  textDecoration: 'underline', cursor: 'pointer', fontFamily: "'Nunito', sans-serif",
};

export function PeriodSetupPrompt() {
  const navigate         = useNavigate();
  const { centre, can }  = useBudgetCentreContext();
  const { cycles = [], cyclesLoading, autoPeriod, dismissAutoPeriod, ensurePeriodNow } = useFinanceContext();
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState(null);

  const onReview      = () => navigate('/budget');
  const onChooseDates = () => navigate('/budget', { state: { openPeriodCreator: true } });

  const today       = getToday();
  const thisMonth   = today.slice(0, 7);
  const centreId    = centre?.id ?? null;
  const covered     = cycleForToday(cycles, today);
  const canManage   = can('manageCycles');
  const monthLabel  = formatMonth(thisMonth);

  // ── A. Receipt ──────────────────────────────────────────────────────────────
  // Held back once the user has dismissed this hub+month (Decision Q3). Read at
  // render rather than latched in state so a remount does not resurrect it.
  const receiptHidden = !autoPeriod || isPeriodReceiptDismissed(centreId, autoPeriod.startDate?.slice(0, 7));

  const handleDismiss = () => {
    dismissPeriodReceipt(centreId, autoPeriod?.startDate?.slice(0, 7));
    dismissAutoPeriod();
  };

  const handleSetUp = async () => {
    setBusy(true); setError(null);
    const { error: err } = await ensurePeriodNow();
    setBusy(false);
    if (err) setError("Couldn't start this month. Please try again.");
  };

  // Hold while the month list is still resolving — otherwise the setup CTA flashes
  // on every cold load before the current month arrives.
  if (cyclesLoading) return null;

  if (autoPeriod && !receiptHidden) {
    // The month the plan came FROM, for the "carried over from …" line. Null on a
    // hub's first month, where there was nothing to carry.
    const source = cycles.find(c => c.id === autoPeriod.sourceCycleId) ?? null;
    const skipped = (autoPeriod.categoriesSkipped || 0) + (autoPeriod.incomeSkipped || 0);

    return (
      <div data-testid="period-receipt" style={{ ...card, border: '1.5px solid var(--c-border, #e5e7eb)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <p style={title}>{autoPeriod.name} started</p>
            <p style={{ ...body, marginBottom: skipped ? 6 : 14 }}>
              {source ? `Your budget carried over from ${source.name}.` : 'Your budget is ready to set up.'}
            </p>
            {skipped > 0 && (
              <p data-testid="receipt-skipped" style={{ ...body, marginBottom: 14, color: 'var(--c-warning, #d97706)' }}>
                {autoPeriod.categoriesSkipped > 0 && `${autoPeriod.categoriesSkipped} categories `}
                {autoPeriod.categoriesSkipped > 0 && autoPeriod.incomeSkipped > 0 && 'and '}
                {autoPeriod.incomeSkipped > 0 && `${autoPeriod.incomeSkipped} income sources `}
                didn't carry over — your plan is at its limit.
              </p>
            )}
          </div>
          <button data-testid="receipt-dismiss" aria-label="Dismiss" onClick={handleDismiss}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-muted, #6b7280)', padding: 2, display: 'flex' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <button data-testid="receipt-review" onClick={onReview} style={primaryBtn}>Review</button>
      </div>
    );
  }

  // A month covers today and there is nothing to report — render nothing.
  if (covered) return null;

  // ── C. Ask the owner ────────────────────────────────────────────────────────
  if (!canManage) {
    return (
      <div data-testid="period-ask-owner" style={{ ...card, border: '1.5px solid var(--c-border, #e5e7eb)' }}>
        <p style={title}>No budget for {monthLabel} yet</p>
        <p style={{ ...body, marginBottom: 0 }}>Ask the hub owner to start this month's budget.</p>
      </div>
    );
  }

  // ── B. Owner setup ──────────────────────────────────────────────────────────
  const previous = [...cycles].filter(c => !c.deleted_at && c.end_date < today)
    .sort((a, b) => b.end_date.localeCompare(a.end_date))[0] ?? null;

  return (
    <div data-testid="period-setup" style={{ ...card, border: '1.5px solid var(--c-warning, #d97706)' }}>
      <p style={title}>Start {monthLabel}</p>
      <p style={body}>
        {previous
          ? `Carry your budget over from ${previous.name} and start tracking this month.`
          : 'Set up this month’s budget to start tracking your spending.'}
      </p>
      {error && (
        <p data-testid="period-setup-error" style={{ ...body, color: 'var(--c-danger, #dc2626)', fontWeight: 700 }}>{error}</p>
      )}
      <button data-testid="period-setup-cta" onClick={handleSetUp} disabled={busy}
        style={{ ...primaryBtn, opacity: busy ? 0.6 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}>
        {busy ? 'Starting…' : `Set up ${monthLabel}`}
      </button>
      <button data-testid="period-choose-dates" onClick={onChooseDates} style={linkBtn}>
        Choose different dates
      </button>
    </div>
  );
}
