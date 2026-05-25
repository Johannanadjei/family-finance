/**
 * views/settings/InstallAppSection.jsx
 *
 * "Install App" card in Settings — always visible on non-standalone browsers.
 *
 * Android with native prompt:  Install button → triggers Chrome OS dialog.
 * Android without native prompt: manual instructions (⋮ → Add to Home Screen).
 *   Chrome suppresses beforeinstallprompt for 90 days after a prior dismiss,
 *   so the manual path is the common case for returning users.
 * iOS: share-icon instructions (no JS prompt on iOS Safari).
 * Hidden when already installed (standalone display mode).
 */

import { useState }                        from 'react';
import { getInstallPrompt, triggerInstall } from '../../lib/pwa';

const isIOS        = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches ?? false;

const card  = { background: 'var(--c-card, #fff)', borderRadius: 16, padding: '16px 18px', boxShadow: 'var(--c-shadow)', marginBottom: 16 };
const label = { fontSize: 13, fontWeight: 900, color: 'var(--c-muted, #6b7280)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 0.8 };

function IconBox({ children }) {
  return (
    <div style={{ flexShrink: 0, background: 'var(--c-accent-light, #f0fdf4)', borderRadius: 10, padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-primary, #064e3b)' }}>
      {children}
    </div>
  );
}

export function InstallAppSection() {
  const [installing, setInstalling] = useState(false);

  if (isStandalone) return null;

  // ── iOS ───────────────────────────────────────────────────────────────────
  if (isIOS) {
    return (
      <div style={card}>
        <p style={label}>Install App</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <IconBox>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 2v13M7 7l5-5 5 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M20 13v7a1 1 0 01-1 1H5a1 1 0 01-1-1v-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
            </svg>
          </IconBox>
          <div>
            <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 700, color: 'var(--c-text, #1c1917)' }}>
              Tap <strong>Share</strong> then <strong>Add to Home Screen</strong>
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--c-muted, #6b7280)' }}>Install for offline access and a native app feel</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Android with native prompt ────────────────────────────────────────────
  const prompt = getInstallPrompt();
  if (prompt) {
    const handleInstall = async () => {
      setInstalling(true);
      await triggerInstall();
      setInstalling(false);
    };

    return (
      <div style={card}>
        <p style={label}>Install App</p>
        <button
          data-testid="settings-install-btn"
          onClick={handleInstall}
          disabled={installing}
          style={{ width: '100%', padding: 12, borderRadius: 10, border: 'none', background: 'var(--c-primary, #064e3b)', color: 'var(--c-btn-text, #ffffff)', fontSize: 14, fontWeight: 800, cursor: installing ? 'not-allowed' : 'pointer', fontFamily: "'Nunito', sans-serif" }}
        >
          {installing ? 'Opening…' : '📲 Install Money B.O.S'}
        </button>
        <p style={{ fontSize: 12, color: 'var(--c-muted, #6b7280)', margin: '8px 0 0', textAlign: 'center' }}>Get offline access and a native app feel</p>
      </div>
    );
  }

  // ── Android without native prompt — manual instructions ───────────────────
  return (
    <div style={card}>
      <p style={label}>Install App</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <IconBox>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="5"  r="1.5" fill="currentColor"/>
            <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
            <circle cx="12" cy="19" r="1.5" fill="currentColor"/>
          </svg>
        </IconBox>
        <div>
          <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 700, color: 'var(--c-text, #1c1917)' }}>
            Tap the <strong>⋮ menu</strong> in Chrome
          </p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--c-muted, #6b7280)' }}>
            then select <strong>Add to Home Screen</strong>
          </p>
        </div>
      </div>
    </div>
  );
}
