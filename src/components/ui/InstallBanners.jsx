/**
 * components/ui/InstallBanners.jsx
 *
 * Shared banner shell and per-platform install instruction banners.
 * Consumed by InstallPrompt.jsx.
 */

import { triggerInstall } from '../../lib/pwa';

// ── Shared shell ──────────────────────────────────────────────────────────────
export function Banner({ children }) {
  return (
    <div
      data-testid="install-prompt"
      style={{
        position:     'fixed',
        bottom:       'calc(80px + env(safe-area-inset-bottom))',
        left:         '50%',
        transform:    'translateX(-50%)',
        width:        'min(calc(100% - 32px), 408px)',
        background:   'var(--c-card, #fff)',
        borderRadius: 16,
        boxShadow:    '0 4px 24px rgba(0,0,0,0.15), 0 1px 4px rgba(0,0,0,0.08)',
        border:       '1.5px solid var(--c-border, #e5e7eb)',
        padding:      '14px 16px',
        zIndex:       1000,
        animation:    'fadeIn .25s ease',
        fontFamily:   "'Nunito', sans-serif",
      }}
    >
      {children}
    </div>
  );
}

function DismissX({ onDismiss }) {
  return (
    <button
      data-testid="install-prompt-dismiss"
      onClick={onDismiss}
      aria-label="Dismiss install prompt"
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--c-muted, #6b7280)', display: 'flex', alignItems: 'center' }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    </button>
  );
}

// ── Android native prompt ─────────────────────────────────────────────────────
export function AndroidBanner({ onDismiss }) {
  const handleInstall = async () => {
    const { outcome } = await triggerInstall();
    if (outcome === 'accepted') onDismiss();
  };

  return (
    <Banner>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 24, flexShrink: 0 }}>📲</span>
        <p style={{ flex: 1, margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--c-text, #1c1917)', lineHeight: 1.35 }}>
          Install Money B.O.S for the best experience
        </p>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            data-testid="install-prompt-dismiss"
            onClick={onDismiss}
            style={{ padding: '7px 12px', borderRadius: 10, border: '1.5px solid var(--c-border, #e5e7eb)', background: 'var(--c-card, #ffffff)', fontSize: 12, fontWeight: 700, color: 'var(--c-text, #1c1917)', cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}
          >
            Dismiss
          </button>
          <button
            data-testid="install-prompt-install"
            onClick={handleInstall}
            style={{ padding: '7px 14px', borderRadius: 10, border: 'none', background: 'var(--c-primary, #064e3b)', fontSize: 12, fontWeight: 800, color: 'var(--c-btn-text, #ffffff)', cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}
          >
            Install
          </button>
        </div>
      </div>
    </Banner>
  );
}

// ── Android manual instructions ───────────────────────────────────────────────
export function AndroidManualBanner({ onDismiss }) {
  return (
    <Banner>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: 'var(--c-text, #1c1917)' }}>Install Money B.O.S</p>
        <DismissX onDismiss={onDismiss} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flexShrink: 0, background: 'var(--c-accent-light, #f0fdf4)', borderRadius: 10, padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-primary, #064e3b)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="5"  r="1.5" fill="currentColor"/>
            <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
            <circle cx="12" cy="19" r="1.5" fill="currentColor"/>
          </svg>
        </div>
        <div>
          <p style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 700, color: 'var(--c-text, #1c1917)' }}>
            Tap the <strong>⋮ menu</strong> in Chrome
          </p>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--c-muted, #6b7280)' }}>
            then select <strong>Add to Home Screen</strong>
          </p>
        </div>
      </div>
    </Banner>
  );
}

// ── iOS instructions ──────────────────────────────────────────────────────────
export function IosBanner({ onDismiss }) {
  return (
    <Banner>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: 'var(--c-text, #1c1917)' }}>Install Money B.O.S</p>
        <DismissX onDismiss={onDismiss} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flexShrink: 0, background: 'var(--c-accent-light, #f0fdf4)', borderRadius: 10, padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-primary, #064e3b)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 2v13M7 7l5-5 5 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M20 13v7a1 1 0 01-1 1H5a1 1 0 01-1-1v-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
          </svg>
        </div>
        <div>
          <p style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 700, color: 'var(--c-text, #1c1917)' }}>
            Tap the <strong>Share</strong> button below
          </p>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--c-muted, #6b7280)' }}>
            then select <strong>Add to Home Screen</strong>
          </p>
        </div>
      </div>
    </Banner>
  );
}
