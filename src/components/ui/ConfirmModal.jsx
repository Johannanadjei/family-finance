/**
 * components/ui/ConfirmModal.jsx
 *
 * Generic centred confirmation dialog (NOT a bottom sheet). Reusable across the
 * app — first consumer is BudgetView's past-period mutation guard (Commit 8).
 *
 * Composes with the shared modal infrastructure: portal to document.body +
 * useModalChrome (scroll-lock + Esc/back close). z-index 360/370 sits ABOVE the
 * bottom sheets (340/350) so a confirm can render over an open sheet.
 *
 * @param {boolean}  open
 * @param {string}   title
 * @param {string}   body
 * @param {string}   [confirmLabel='Continue']
 * @param {string}   [cancelLabel='Cancel']
 * @param {'primary'|'danger'} [confirmTone='primary'] — 'danger' renders the confirm
 *   button in red for destructive actions (e.g. Reset budget period). Default keeps
 *   the existing primary-green styling, so prior consumers are unaffected.
 * @param {function} onConfirm
 * @param {function} onCancel
 */

import { createPortal }   from 'react-dom';
import { useModalChrome } from '../../hooks/useModalChrome';

export function ConfirmModal({ open, title, body, confirmLabel = 'Continue', cancelLabel = 'Cancel', confirmTone = 'primary', onConfirm, onCancel }) {
  useModalChrome({ isOpen: open, onClose: onCancel });   // call ABOVE the guard, per its contract
  if (!open) return null;

  return createPortal(
    <>
      <div onClick={onCancel} aria-hidden="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 360 }} />
      <div role="dialog" aria-label={title} style={{ position: 'fixed', top: '50%', left: 'max(0px, calc(50vw - 220px))', transform: 'translateY(-50%)', width: '100%', maxWidth: 360, margin: '0 16px', background: 'var(--c-modal-bg, var(--c-card, #fff))', borderRadius: 16, padding: '20px', zIndex: 370, boxShadow: '0 8px 32px rgba(0,0,0,.18)' }}>
        <p style={{ fontSize: 17, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: '0 0 8px' }}>{title}</p>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-muted, #6b7280)', margin: '0 0 20px', lineHeight: 1.5 }}>{body}</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button onClick={onCancel} style={{ padding: '12px', borderRadius: 12, border: '1.5px solid var(--c-border, #e5e7eb)', background: 'var(--c-chip-bg, #f3f4f6)', fontSize: 14, fontWeight: 800, cursor: 'pointer', color: 'var(--c-text, #1c1917)', fontFamily: "'Nunito', sans-serif" }}>
            {cancelLabel}
          </button>
          <button onClick={onConfirm} style={{ padding: '12px', borderRadius: 12, border: 'none', background: confirmTone === 'danger' ? 'var(--c-danger, #dc2626)' : 'var(--c-primary, #064e3b)', color: 'var(--c-btn-text, #ffffff)', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
