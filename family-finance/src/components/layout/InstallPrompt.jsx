import { useState, useEffect } from 'react';

/**
 * InstallPrompt — shows a native-feeling "Add to Home Screen" banner.
 * Listens for the browser's beforeinstallprompt event (Chrome/Android).
 * On iOS, shows a manual instruction since iOS doesn't support the event.
 */
export function InstallPrompt() {
  const [prompt,      setPrompt]      = useState(null);  // deferred install event
  const [showIOS,     setShowIOS]     = useState(false);
  const [dismissed,   setDismissed]   = useState(false);
  const [installed,   setInstalled]   = useState(false);

  useEffect(() => {
    // Already installed as PWA — don't show banner
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true);
      return;
    }

    // iOS detection — Safari doesn't fire beforeinstallprompt
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    if (isIOS && isSafari && !dismissed) {
      setTimeout(() => setShowIOS(true), 3000);
    }

    // Chrome/Android — capture the deferred prompt
    const handler = (e) => {
      e.preventDefault();
      setPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [dismissed]);

  const handleInstall = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setPrompt(null);
  };

  const dismiss = () => { setPrompt(null); setShowIOS(false); setDismissed(true); };

  // Already installed or user dismissed
  if (installed || dismissed || (!prompt && !showIOS)) return null;

  // iOS manual instructions
  if (showIOS) {
    return (
      <div style={{ position: 'fixed', bottom: 90, left: 12, right: 12, maxWidth: 416, margin: '0 auto', zIndex: 50, background: '#1c1917', borderRadius: 18, padding: '16px 18px', boxShadow: '0 8px 32px rgba(0,0,0,.35)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 28, flexShrink: 0 }}>📱</span>
            <div>
              <p style={{ fontWeight: 900, fontSize: 14, color: '#fff', margin: '0 0 4px' }}>Install this app</p>
              <p style={{ fontSize: 12, color: '#a3a3a3', margin: 0, lineHeight: 1.5 }}>
                Tap <strong style={{ color: '#fff' }}>Share</strong> then <strong style={{ color: '#fff' }}>"Add to Home Screen"</strong> to install the Family Finance app on your iPhone.
              </p>
            </div>
          </div>
          <button onClick={dismiss} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 20, cursor: 'pointer', padding: '0 0 0 8px', lineHeight: 1, flexShrink: 0 }}>×</button>
        </div>
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center', gap: 6 }}>
          {['Tap', '⬆', 'Share', '→', 'Add to Home Screen'].map((s, i) => (
            <span key={i} style={{ fontSize: i % 2 === 0 ? 11 : 16, fontWeight: i % 2 === 0 ? 700 : 400, color: i % 2 === 0 ? '#6ee7b7' : '#9ca3af' }}>{s}</span>
          ))}
        </div>
      </div>
    );
  }

  // Chrome/Android — native install prompt
  return (
    <div style={{ position: 'fixed', bottom: 90, left: 12, right: 12, maxWidth: 416, margin: '0 auto', zIndex: 50, background: '#1c1917', borderRadius: 18, padding: '16px 18px', boxShadow: '0 8px 32px rgba(0,0,0,.35)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#064e3b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🏡</div>
          <div>
            <p style={{ fontWeight: 900, fontSize: 14, color: '#fff', margin: '0 0 2px' }}>Install app</p>
            <p style={{ fontSize: 11, color: '#a3a3a3', margin: 0 }}>Add to your home screen</p>
          </div>
        </div>
        <button onClick={dismiss} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 20, cursor: 'pointer', padding: 4, lineHeight: 1 }}>×</button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={handleInstall}
          style={{ flex: 2, padding: '12px', borderRadius: 12, border: 'none', background: '#064e3b', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
          Install
        </button>
        <button onClick={dismiss}
          style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1px solid #404040', background: 'transparent', color: '#9ca3af', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          Not now
        </button>
      </div>
    </div>
  );
}
