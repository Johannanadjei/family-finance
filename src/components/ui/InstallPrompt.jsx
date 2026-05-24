/**
 * components/ui/InstallPrompt.jsx
 *
 * Bottom banner for PWA installation.
 *
 * Android/Chrome (native prompt available):
 *   Shows Install button — calls the deferred beforeinstallprompt event.
 *
 * Android/Chrome (no prompt after 10 s):
 *   Chrome suppresses beforeinstallprompt for 90 days after a prior dismiss or when
 *   engagement heuristics aren't met. After 10 s with no event we fall back to manual
 *   instructions: "Tap ⋮ → Add to Home Screen".
 *
 * iOS Safari:
 *   beforeinstallprompt never fires. Shows static instructions immediately.
 *
 * Dismissed state stored in sessionStorage. Never shown in standalone mode.
 */

import { useState, useEffect }                            from 'react';
import { getInstallPrompt }                               from '../../lib/pwa';
import { AndroidBanner, AndroidManualBanner, IosBanner }  from './InstallBanners';

const SESSION_KEY  = 'ffc_install_dismissed';
const FALLBACK_MS  = 10000;

const isIOS        = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches ?? false;

export function InstallPrompt() {
  const [kind, setKind] = useState(() => {
    if (isStandalone)                       return null;
    if (sessionStorage.getItem(SESSION_KEY)) return null;
    if (isIOS)                              return 'ios';
    if (getInstallPrompt())                 return 'android';
    return null; // Android: wait for event or 10 s fallback
  });

  useEffect(() => {
    if (isStandalone || sessionStorage.getItem(SESSION_KEY)) return;

    let timer;

    const onReady = () => {
      if (!isIOS) {
        clearTimeout(timer);
        setKind('android');
      }
    };
    window.addEventListener('pwaInstallReady', onReady);

    // Fallback: Chrome suppresses the prompt after prior use. Show manual
    // instructions after 10 s so Android users always have a path to install.
    if (!isIOS) {
      timer = setTimeout(() => {
        if (sessionStorage.getItem(SESSION_KEY)) return;
        setKind(k => (k === null ? 'android-manual' : k));
      }, FALLBACK_MS);
    }

    return () => {
      window.removeEventListener('pwaInstallReady', onReady);
      clearTimeout(timer);
    };
  }, []);

  const handleDismiss = () => {
    sessionStorage.setItem(SESSION_KEY, '1');
    setKind(null);
  };

  if (!kind)                     return null;
  if (kind === 'ios')            return <IosBanner onDismiss={handleDismiss} />;
  if (kind === 'android')        return <AndroidBanner onDismiss={handleDismiss} />;
  if (kind === 'android-manual') return <AndroidManualBanner onDismiss={handleDismiss} />;
  return null;
}
