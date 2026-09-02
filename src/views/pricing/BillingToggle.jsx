/**
 * views/pricing/BillingToggle.jsx
 *
 * Pure display (§4): the Monthly / Annual segmented control on the pricing page.
 * Owns no state — PricingView holds the selected interval and passes it down.
 * The savings percentage comes from PRICING (lib/pricing.js), never a literal.
 *
 * Extracted from PricingView when the manage-subscription flow landed: the view
 * was at 188 of its 200-line audit limit, and this control was already a
 * self-contained props-only component.
 *
 * @param {{ billing: 'monthly'|'annual', onChange: (key: string) => void }} props
 */

import { PRICING } from '../../lib/pricing';

export function BillingToggle({ billing, onChange }) {
  const opt = (key, label) => {
    const active = billing === key;
    return (
      <button key={key} data-testid={`toggle-${key}`} onClick={() => onChange(key)}
        style={{ flex: 1, padding: '9px 10px', borderRadius: 10, border: 'none', cursor: 'pointer', transition: 'background .15s',
          background: active ? 'var(--c-primary, #064e3b)' : 'transparent',
          color: active ? 'var(--c-btn-text, #fff)' : 'var(--c-muted, #6b7280)',
          fontSize: 14, fontWeight: 800, fontFamily: "'Nunito', sans-serif" }}>
        {label}
      </button>
    );
  };
  return (
    <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--c-input-bg, #f9fafb)', border: '1.5px solid var(--c-border, #e5e7eb)', borderRadius: 12, marginBottom: 16 }}>
      {opt('monthly', 'Monthly')}
      {opt('annual', `Annual · Save ${PRICING.annual.savings_percent}%`)}
    </div>
  );
}
