/**
 * components/ui/InstallPrompt.jsx
 *
 * Shows a bottom banner when the PWA install prompt is available.
 * Dismissed state is stored in sessionStorage so it resets each tab.
 * Never shows when already running in standalone mode.
 */

import { useState, useEffect } from 'react';

const SESSION_KEY = 'ffc_install_dismissed';

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible]               = useState(false);

  useEffect(() => {
    // Already installed — standalone display mode
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    // User dismissed this session
    if (sessionStorage.getItem(SESSION_KEY)) return;

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setVisible(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    sessionStorage.setItem(SESSION_KEY, '1');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      data-testid="install-prompt"
      style={{
        position:       'fixed',
        bottom:         'calc(80px + env(safe-area-inset-bottom))',
        left:           '50%',
        transform:      'translateX(-50%)',
        width:          'min(calc(100% - 32px), 408px)',
        background:     'var(--c-card, #fff)',
        borderRadius:   16,
        boxShadow:      '0 4px 24px rgba(0,0,0,0.15), 0 1px 4px rgba(0,0,0,0.08)',
        border:         '1.5px solid var(--c-border, #e5e7eb)',
        padding:        '14px 16px',
        display:        'flex',
        alignItems:     'center',
        gap:            12,
        zIndex:         1000,
        animation:      'fadeIn .25s ease',
      }}
    >
      <span style={{ fontSize: 24, flexShrink: 0 }}>📲</span>
      <p style={{
        flex:       1,
        margin:     0,
        fontSize:   13,
        fontWeight: 700,
        color:      'var(--c-text, #1c1917)',
        fontFamily: "'Nunito', sans-serif",
        lineHeight: 1.35,
      }}>
        Install Money B.O.S for the best experience
      </p>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          data-testid="install-prompt-dismiss"
          onClick={handleDismiss}
          style={{
            padding:      '7px 12px',
            borderRadius: 10,
            border:       '1.5px solid var(--c-border, #e5e7eb)',
            background:   'transparent',
            fontSize:     12,
            fontWeight:   700,
            color:        'var(--c-muted, #6b7280)',
            cursor:       'pointer',
            fontFamily:   "'Nunito', sans-serif",
          }}
        >
          Dismiss
        </button>
        <button
          data-testid="install-prompt-install"
          onClick={handleInstall}
          style={{
            padding:      '7px 14px',
            borderRadius: 10,
            border:       'none',
            background:   'var(--c-primary, #064e3b)',
            fontSize:     12,
            fontWeight:   800,
            color:        '#fff',
            cursor:       'pointer',
            fontFamily:   "'Nunito', sans-serif",
          }}
        >
          Install
        </button>
      </div>
    </div>
  );
}
