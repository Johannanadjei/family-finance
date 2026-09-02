/**
 * views/pricing/ManageSubscriptionButton.jsx
 *
 * Pure display (§4): renders the Pro user's "Manage subscription" button and its
 * error line. It never calls a service and never fetches — PricingView owns the
 * handler, the loading flag and the error string, exactly as it does for the
 * Upgrade CTA. Extracted from PricingView to keep that view inside its 200-line
 * audit limit.
 *
 * The button sends the customer to Paystack's own hosted page (card update or
 * cancel). We surface no cancel confirmation of our own: Paystack owns that
 * conversation, and the outcome reaches us as a webhook event.
 *
 * @param {{ onClick: () => void, loading: boolean, error: string|null }} props
 */
export function ManageSubscriptionButton({ onClick, loading, error }) {
  return (
    <>
      <button data-testid="manage-sub" onClick={onClick} disabled={loading}
        style={{ width: '100%', padding: 12, borderRadius: 12, border: '1.5px solid var(--c-border, #e5e7eb)', background: 'transparent',
          color: 'var(--c-text, #1c1917)', fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
          fontFamily: "'Nunito', sans-serif", transition: 'opacity .15s', opacity: loading ? 0.6 : 1 }}>
        {loading ? 'Opening…' : 'Manage subscription'}
      </button>
      <p style={{ fontSize: 12, color: 'var(--c-muted, #6b7280)', margin: '8px 0 0', textAlign: 'center' }}>
        Update your card or cancel on Paystack.
      </p>
      {error && (
        <p data-testid="manage-error" style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-danger, #dc2626)', margin: '10px 0 0' }}>
          {error}
        </p>
      )}
    </>
  );
}
