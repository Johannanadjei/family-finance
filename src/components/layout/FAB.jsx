/**
 * components/layout/FAB.jsx
 *
 * Floating action button — fixed bottom right above BottomNav.
 * Triggers AddModal (wired in Session 8).
 * Uses safe-area-inset-bottom for mobile browser chrome.
 *
 * @param {function} onClick
 */

export function FAB({ onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label="Add transaction"
      style={{
        position:     'fixed',
        bottom:       'calc(72px + env(safe-area-inset-bottom))',
        right:        'max(16px, calc(50vw - 220px + 16px))',
        width:        56,
        height:       56,
        borderRadius: '50%',
        background:   'linear-gradient(135deg, var(--c-primary, #064e3b), var(--c-primary-2, #0d7060))',
        border:       'none',
        color:        '#fff',
        fontSize:     28,
        fontWeight:   300,
        cursor:       'pointer',
        boxShadow:    '0 4px 16px rgba(6,78,59,.4)',
        zIndex:       150,
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'center',
        lineHeight:   1,
      }}
    >
      +
    </button>
  );
}
