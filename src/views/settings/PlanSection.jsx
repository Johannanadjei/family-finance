/**
 * views/settings/PlanSection.jsx
 *
 * Settings entry point to the pricing page. Shows the current plan tier and
 * deep-links to /pricing. Reads tier from SubscriptionContext (single source).
 * Slots immediately after CentreSettingsSection in SettingsView.
 *
 * Lives in views/settings/ alongside the other settings sections (imported by
 * SettingsView as ./settings/PlanSection) — not src/components/settings/, which
 * does not exist in this codebase.
 */

import { useNavigate }            from 'react-router-dom';
import { useSubscriptionContext } from '../../context/SubscriptionContext';

export function PlanSection() {
  const navigate  = useNavigate();
  const { isPro } = useSubscriptionContext();

  return (
    <div style={{ background: 'var(--c-card, #fff)', borderRadius: 16, padding: '16px 18px', boxShadow: 'var(--c-shadow)', marginBottom: 16 }}>
      <p style={{ fontSize: 13, fontWeight: 900, color: 'var(--c-muted, #6b7280)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 0.8 }}>Plan</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p data-testid="plan-tier" style={{ fontSize: 17, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: '0 0 2px' }}>
            {isPro ? 'Pro' : 'Free'}
          </p>
          <p style={{ fontSize: 12, color: 'var(--c-muted, #6b7280)', margin: 0 }}>
            {isPro ? "You're on the Pro plan" : 'Upgrade for more hubs, members and themes'}
          </p>
        </div>
        <button data-testid="plan-cta" onClick={() => navigate('/pricing')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-primary, #064e3b)', fontSize: 13, fontWeight: 800, padding: 0, fontFamily: "'Nunito', sans-serif", whiteSpace: 'nowrap' }}>
          {isPro ? 'Manage Plan' : 'Upgrade to Pro'}
        </button>
      </div>
    </div>
  );
}
