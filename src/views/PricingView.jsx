/**
 * views/PricingView.jsx
 *
 * Full-screen Free vs Pro pricing page (route: /pricing — chrome-less; App.jsx
 * suppresses BottomNav/FAB there). Back button always routes home (D1: a Paystack
 * return puts an external URL in history, so navigate(-1) is unsafe).
 *
 * Prices come from PRICING (lib/pricing.js) — never hardcoded. The Upgrade CTA calls
 * startCheckout() and redirects to Paystack's hosted checkout. On return
 * (?checkout=return) we poll the subscription for ~30s to cover webhook lag (D2)
 * before showing a "may take a moment" note — never infinite-poll.
 *
 * A Pro user also gets "Manage subscription" — a Paystack-hosted card-update/cancel
 * link. Gated on the VIEWER's own isPro, never hubPlan: a member of someone else's
 * Pro hub has no subscription of their own to manage.
 */

import { useState, useEffect }     from 'react';
import { useNavigate }             from 'react-router-dom';
import { useSubscriptionContext }  from '../context/SubscriptionContext';
import { startCheckout }           from '../services/checkout.service';
import { getManageLink }           from '../services/billing.service';
import { ManageSubscriptionButton } from './pricing/ManageSubscriptionButton';
import { BillingToggle }            from './pricing/BillingToggle';
import { PRICING }                 from '../lib/pricing';

const POLL_INTERVAL_MS = 2000;   // refresh cadence on checkout return (D2)
const MAX_POLLS        = 15;     // ×2s ≈ 30s, then surface the lag note (D2)

const FREE_FEATURES = ['1 hub', '2 members', '10 categories', '3 months of history'];
const PRO_FEATURES  = ['10 hubs', '15 members', 'Unlimited categories', 'Full history', 'Premium themes'];

const page    = { minHeight: '100vh', maxWidth: 440, margin: '0 auto', background: 'var(--c-bg, #f3f4f6)', fontFamily: "'Nunito', sans-serif", padding: 16, boxSizing: 'border-box' };
const card    = { background: 'var(--c-card, #fff)', borderRadius: 20, padding: '20px 18px', boxShadow: 'var(--c-shadow)', marginBottom: 14 };
const pill     = { fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 999, background: 'var(--c-accent-light, #f0fdf4)', color: 'var(--c-primary, #064e3b)' };
const featRow = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: 'var(--c-text, #1c1917)', margin: '0 0 8px' };

const BANNERS = {
  processing: { testid: 'processing-banner',  bg: 'var(--c-accent-light, #f0fdf4)', color: 'var(--c-primary, #064e3b)', weight: 800, size: 14, text: 'Processing payment…' },
  done:       { testid: 'processing-done',     bg: 'var(--c-accent-light, #f0fdf4)', color: 'var(--c-primary, #064e3b)', weight: 800, size: 14, text: "You're on Pro 🎉" },
  timeout:    { testid: 'processing-timeout',  bg: 'var(--c-input-bg, #f9fafb)',     color: 'var(--c-muted, #6b7280)',  weight: 700, size: 13, text: 'Payment may take a moment. Check back in a few minutes.' },
};

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" stroke="var(--c-success, #059669)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlanCard({ name, price, period, features, highlighted, isCurrent, cta }) {
  const key = name.toLowerCase();
  return (
    <div data-testid={`plan-${key}`} style={{ ...card, border: highlighted ? '2px solid var(--c-primary, #064e3b)' : '1.5px solid var(--c-border, #e5e7eb)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <p style={{ fontSize: 18, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: 0 }}>{name}</p>
        {isCurrent && <span data-testid={`current-${key}`} style={pill}>Your plan</span>}
      </div>
      <p style={{ margin: '0 0 16px' }}>
        <span style={{ fontSize: 30, fontWeight: 900, color: 'var(--c-text, #1c1917)' }}>{price}</span>
        {period && <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-muted, #6b7280)' }}>{` / ${period}`}</span>}
      </p>
      {features.map((f) => <p key={f} style={featRow}><Check />{f}</p>)}
      {cta && (
        <button data-testid="upgrade-cta" onClick={cta.onClick} disabled={cta.loading}
          style={{ width: '100%', marginTop: 8, padding: 14, borderRadius: 12, border: 'none', background: 'var(--c-primary, #064e3b)',
            color: 'var(--c-btn-text, #fff)', fontSize: 15, fontWeight: 800, cursor: cta.loading ? 'not-allowed' : 'pointer', fontFamily: "'Nunito', sans-serif" }}>
          {cta.loading ? 'Starting checkout…' : cta.label}
        </button>
      )}
    </div>
  );
}

export function PricingViewSkeleton() {
  const block = { background: 'var(--c-border, #e5e7eb)', borderRadius: 16 };
  return (
    <div style={page} data-testid="pricing-skeleton">
      <div style={{ ...block, height: 24, width: 80, marginBottom: 20 }} />
      <div style={{ ...block, height: 200, marginBottom: 14 }} />
      <div style={{ ...block, height: 280 }} />
    </div>
  );
}

export function PricingView() {
  const navigate = useNavigate();
  const { isPro, isLoading, error, refresh } = useSubscriptionContext();
  const [billing,     setBilling]     = useState('monthly');
  const [checkingOut, setCheckingOut] = useState(false);
  const [ctaError,    setCtaError]    = useState(null);
  const [managing,    setManaging]    = useState(false);
  const [manageError, setManageError] = useState(null);
  const [returnState, setReturnState] = useState(
    () => (new URLSearchParams(window.location.search).get('checkout') === 'return' ? 'processing' : null),
  );

  // Resolve the processing state the moment the subscription flips to Pro (D2).
  useEffect(() => {
    if (returnState === 'processing' && isPro) setReturnState('done');
  }, [isPro, returnState]);

  // Poll on checkout return to cover webhook lag (D2): refresh every 2s up to ~30s,
  // then surface a "may take a moment" note. Strip the URL param once, never loop forever.
  useEffect(() => {
    if (returnState !== 'processing') return undefined;
    window.history.replaceState({}, '', '/pricing');
    let polls = 0;
    refresh();
    const id = setInterval(() => {
      polls += 1;
      if (polls >= MAX_POLLS) {
        clearInterval(id);
        setReturnState((s) => (s === 'processing' ? 'timeout' : s));
        return;
      }
      refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [returnState, refresh]);

  if (isLoading) return <PricingViewSkeleton />;

  const handleUpgrade = async () => {
    setCtaError(null);
    setCheckingOut(true);
    const { data, error: err } = await startCheckout(billing);
    if (err || !data?.authorization_url) {
      setCheckingOut(false);
      setCtaError("Couldn't start checkout. Please try again.");
      return;
    }
    window.location.assign(data.authorization_url);
  };

  // Paystack's hosted card-update/cancel page. The link is single-use, so it is
  // fetched on click, never ahead of time.
  const handleManage = async () => {
    setManageError(null);
    setManaging(true);
    const { data, error: err } = await getManageLink();
    if (err || !data?.link) {
      setManaging(false);
      return setManageError("Couldn't open the billing page. Please try again.");
    }
    window.location.assign(data.link);
  };

  const plan   = PRICING[billing];
  const banner = returnState ? BANNERS[returnState] : null;

  return (
    <div style={page}>
      <button onClick={() => navigate('/')} aria-label="Go back"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text, #1c1917)', padding: '4px 8px 16px 0', display: 'flex', alignItems: 'center' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <p style={{ fontSize: 24, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: '0 0 4px' }}>Choose your plan</p>
      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-muted, #6b7280)', margin: '0 0 18px' }}>Upgrade any time.</p>

      {banner && (
        <div data-testid={banner.testid} style={{ borderRadius: 12, padding: '14px 16px', background: banner.bg, marginBottom: 14 }}>
          <p style={{ fontSize: banner.size, fontWeight: banner.weight, color: banner.color, margin: 0 }}>{banner.text}</p>
        </div>
      )}
      {error && <p data-testid="subscription-error" style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-danger, #dc2626)', margin: '0 0 12px' }}>Couldn't confirm your current plan.</p>}

      <BillingToggle billing={billing} onChange={setBilling} />

      <PlanCard name="Free" price="₵0" period="" features={FREE_FEATURES} isCurrent={!isPro} cta={null} />
      <PlanCard name="Pro" price={plan.display} period={plan.period} features={PRO_FEATURES} highlighted isCurrent={isPro}
        cta={isPro ? null : { label: 'Upgrade to Pro', onClick: handleUpgrade, loading: checkingOut }} />

      {ctaError && <p data-testid="cta-error" style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-danger, #dc2626)', margin: '0 0 12px' }}>{ctaError}</p>}

      {isPro && (
        <ManageSubscriptionButton onClick={handleManage} loading={managing} error={manageError} />
      )}
    </div>
  );
}
