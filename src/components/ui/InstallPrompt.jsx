/**
 * components/ui/InstallPrompt.jsx
 *
 * Bottom banner for PWA installation.
 *
 * Android/Chrome: listens for beforeinstallprompt (captured early in main.jsx via
 * lib/pwa.js so it is never missed even if the component mounts after the event fires).
 *
 * iOS: beforeinstallprompt never fires on iOS Safari. Shows a static instruction
 * banner instead: "Tap Share → Add to Home Screen".
 *
 * Session dismiss is stored in sessionStorage. Never shows in standalone mode.
 */

import { useState, useEffect } from 'react';
import { getInstallPrompt, triggerInstall, clearInstallPrompt } from '../../lib/pwa';

const SESSION_KEY  = 'ffc_install_dismissed';
const isIOS        = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches ?? false;

function shouldShowIOS() {
  return isIOS && !isStandalone && !sessionStorage.getItem(SESSION_KEY);
}

function shouldShowAndroid() {
  return !isIOS && !isStandalone && !sessionStorage.getItem(SESSION_KEY) && getInstallPrompt() !== null;
}

// ── Shared banner shell ────────────────────────────────────────────────────────
function Banner({ children }) {
  return (
    <div
      data-testid="install-prompt"
      style={{
        position:   'fixed',
        bottom:     'calc(80px + env(safe-area-inset-bottom))',
        left:       '50%',
        transform:  'translateX(-50%)',
        width:      'min(calc(100% - 32px), 408px)',
        background: 'var(--c-card, #fff)',
        borderRadius: 16,
        boxShadow:  '0 4px 24px rgba(0,0,0,0.15), 0 1px 4px rgba(0,0,0,0.08)',
        border:     '1.5px solid var(--c-border, #e5e7eb)',
        padding:    '14px 16px',
        zIndex:     1000,
        animation:  'fadeIn .25s ease',
        fontFamily: "'Nunito', sans-serif",
      }}
    >
      {children}
    </div>
  );
}

// ── Android / Chrome banner ────────────────────────────────────────────────────
function AndroidBanner({ onDismiss }) {
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
            style={{ padding: '7px 12px', borderRadius: 10, border: '1.5px solid var(--c-border, #e5e7eb)', background: 'transparent', fontSize: 12, fontWeight: 700, color: 'var(--c-muted, #6b7280)', cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}
          >
            Dismiss
          </button>
          <button
            data-testid="install-prompt-install"
            onClick={handleInstall}
            style={{ padding: '7px 14px', borderRadius: 10, border: 'none', background: 'var(--c-primary, #064e3b)', fontSize: 12, fontWeight: 800, color: '#fff', cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}
          >
            Install
          </button>
        </div>
      </div>
    </Banner>
  );
}

// ── iOS banner ─────────────────────────────────────────────────────────────────
function IosBanner({ onDismiss }) {
  return (
    <Banner>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: 'var(--c-text, #1c1917)' }}>
          Install Money B.O.S
        </p>
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
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flexShrink: 0, background: 'var(--c-accent-light, #f0fdf4)', borderRadius: 10, padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* iOS share icon */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: 'var(--c-primary, #064e3b)' }}>
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

// ── Main export ────────────────────────────────────────────────────────────────
export function InstallPrompt() {
  const [kind, setKind] = useState(() => {
    if (isStandalone)                  return null;
    if (sessionStorage.getItem(SESSION_KEY)) return null;
    if (isIOS)                         return 'ios';
    if (getInstallPrompt())            return 'android';
    return null;
  });

  useEffect(() => {
    if (isStandalone || sessionStorage.getItem(SESSION_KEY)) return;

    const handler = () => {
      if (!isIOS) setKind('android');
    };

    window.addEventListener('pwaInstallReady', handler);
    return () => window.removeEventListener('pwaInstallReady', handler);
  }, []);

  const handleDismiss = () => {
    sessionStorage.setItem(SESSION_KEY, '1');
    setKind(null);
  };

  if (!kind) return null;
  if (kind === 'ios')     return <IosBanner onDismiss={handleDismiss} />;
  if (kind === 'android') return <AndroidBanner onDismiss={handleDismiss} />;
  return null;
}
