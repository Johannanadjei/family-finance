/**
 * views/payday/UpdateReceivedSheet.jsx
 *
 * Bottom sheet asking whether the received amount should be updated after the
 * expected amount is edited on a confirmed income source.
 * zIndex 360 — above ConfirmSheet backdrop (340), below SidePanel (400).
 *
 * @param {boolean}  isOpen
 * @param {string}   sourceId       — used for data-testid
 * @param {number}   receivedAmount — currently confirmed amount
 * @param {number}   pendingAmount  — newly saved expected amount
 * @param {function} fmt
 * @param {function} onConfirm      — update received
 * @param {function} onDismiss      — keep existing received amount
 */

export function UpdateReceivedSheet({ isOpen, sourceId, receivedAmount, pendingAmount, fmt, onConfirm, onDismiss }) {
  if (!isOpen) return null;

  return (
    <>
      <div
        data-testid="update-received-backdrop"
        onClick={onDismiss}
        aria-hidden="true"
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 355 }}
      />
      <div
        role="dialog"
        aria-label="Update received amount"
        data-testid={`received-update-prompt-${sourceId}`}
        style={{ position: 'fixed', bottom: 0, left: 'max(0px, calc(50vw - 220px))', width: '100%', maxWidth: 440, background: 'var(--c-card, #fff)', borderRadius: '20px 20px 0 0', padding: '20px', zIndex: 360, boxShadow: '0 -8px 32px rgba(0,0,0,.12)' }}
      >
        {/* Handle */}
        <div style={{ width: 40, height: 4, background: 'var(--c-border, #e5e7eb)', borderRadius: 2, margin: '0 auto 16px' }} />

        {/* Heading */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 22 }}>💰</span>
          <p style={{ fontSize: 16, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: 0 }}>Update received amount?</p>
        </div>

        {/* Body */}
        <p style={{ fontSize: 13, color: 'var(--c-muted, #6b7280)', margin: '0 0 18px', lineHeight: 1.5 }}>
          You confirmed {fmt(receivedAmount)} this month. Did you actually receive {fmt(pendingAmount)}?
        </p>

        {/* Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            data-testid={`received-update-confirm-${sourceId}`}
            onClick={onConfirm}
            style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: 'var(--c-primary, #064e3b)', color: 'var(--c-btn-text, #ffffff)', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}
          >
            Yes, update to {fmt(pendingAmount)}
          </button>
          <button
            data-testid={`received-update-keep-${sourceId}`}
            onClick={onDismiss}
            style={{ width: '100%', padding: '13px', borderRadius: 12, border: '1.5px solid var(--c-border, #e5e7eb)', background: 'var(--c-card, #ffffff)', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif", color: 'var(--c-text, #1c1917)' }}
          >
            No, keep as {fmt(receivedAmount)}
          </button>
        </div>
      </div>
    </>
  );
}
