/**
 * components/ui/Toast.jsx
 *
 * Bottom toast notification — auto-dismisses after 4 seconds.
 * Shows message with tappable Edit link.
 * Used after logging a variable expense to inform user it counts against Spare Money.
 *
 * z-index 250 — above BottomNav, below ConfirmSheet (350) and SidePanel (400).
 *
 * @param {string}   message    — toast message text
 * @param {function} onEdit     — called when Edit tapped
 * @param {function} onDismiss  — called on auto-dismiss or manual dismiss
 */

import { useEffect } from 'react';

export function Toast({ message, onEdit, actionLabel = 'Edit', onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      style={{
        position:     'fixed',
        bottom:       'calc(80px + env(safe-area-inset-bottom))',
        left:         'max(0px, calc(50vw - 220px))',
        width:        '100%',
        maxWidth:     440,
        zIndex:       250,
        padding:      '0 12px',
        boxSizing:    'border-box',
        pointerEvents: 'none',
      }}
    >
      <div style={{
        background:   '#111827',
        borderRadius: 12,
        padding:      '12px 14px',
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'space-between',
        boxShadow:    '0 4px 16px rgba(0,0,0,.2)',
        pointerEvents: 'auto',
      }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#fff', margin: 0, flex: 1 }}>
          {message}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <button
            onClick={onEdit}
            style={{
              background: 'none', border: 'none', fontSize: 13, fontWeight: 900,
              color: 'var(--c-accent, #6ee7b7)', cursor: 'pointer', padding: 0,
              fontFamily: "'Nunito', sans-serif",
            }}
          >
            {actionLabel}
          </button>
          <button
            onClick={onDismiss}
            aria-label="Dismiss"
            style={{
              background: 'none', border: 'none', fontSize: 16,
              color: 'rgba(255,255,255,.5)', cursor: 'pointer', padding: 0,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
