/**
 * components/layout/HubFooter.jsx
 *
 * The SidePanel footer's hub-creation control + plan-cap gate. Extracted from
 * SidePanel so that file stays under its size limit and the cap logic lives in
 * one focused place.
 *
 * Three states (driven by the OWNED hub count vs. the tier's maxHubs from
 * lib/plans.js — the client-side half of the defense-in-depth gate; the
 * create_hub RPC is the real enforcement):
 *   • at cap, free → active "Upgrade to add more hubs" → opens UpgradeModal
 *   • at cap, pro  → static "Maximum N hubs reached" (no higher tier to upsell)
 *   • under cap    → "+ New BOS Hub" → onCreateHub
 *
 * The caller (SidePanel) gates rendering on can('settings'); this component
 * assumes it should render.
 *
 * @param {'free'|'pro'} userPlan
 * @param {number}       hubCount   the caller's OWNED, active, non-archived hubs
 * @param {function}     onCreateHub
 * @param {function}     onUpgradeNavigate  routes to /pricing — owned by SidePanel so it
 *                                          can close the drawer AND dismiss its own modal-
 *                                          chrome history entry first (see SidePanel)
 */

import { useState }        from 'react';
import { getLimitsForTier } from '../../lib/plans';
import { UpgradeModal }    from '../ui/UpgradeModal';

export function HubFooter({ userPlan, hubCount, onCreateHub, onUpgradeNavigate }) {
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const maxHubs = getLimitsForTier(userPlan).maxHubs;
  const atCap   = hubCount >= maxHubs;

  return (
    <div style={{ padding: '12px 16px calc(16px + env(safe-area-inset-bottom, 20px))', borderTop: '1px solid var(--c-border, #e5e7eb)', flexShrink: 0 }}>
      {atCap && userPlan === 'free' ? (
        <button
          onClick={() => setUpgradeOpen(true)}
          style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: 'var(--c-primary, #064e3b)', color: 'var(--c-btn-text, #ffffff)', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}
        >
          Upgrade to add more hubs
        </button>
      ) : atCap ? (
        <p style={{ fontSize: 13, color: 'var(--c-muted, #6b7280)', margin: 0, fontWeight: 600, textAlign: 'center' }}>Maximum {maxHubs} hubs reached</p>
      ) : (
        <button
          onClick={onCreateHub}
          style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: 'var(--c-primary, #064e3b)', color: 'var(--c-btn-text, #ffffff)', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          + New BOS Hub
        </button>
      )}

      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} onUpgrade={() => { setUpgradeOpen(false); onUpgradeNavigate(); }} />
    </div>
  );
}
