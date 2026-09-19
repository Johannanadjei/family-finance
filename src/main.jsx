import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { setInstallPrompt, initPwaUpdates } from './lib/pwa';
import { UpdateToast } from './components/ui/UpdateToast';

// Capture beforeinstallprompt immediately — before React renders.
// Stored in lib/pwa.js so InstallPrompt can read it even if it mounts after the event fired.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  setInstallPrompt(e);
  window.dispatchEvent(new CustomEvent('pwaInstallReady'));
});

// Owns service-worker registration — the build no longer injects registerSW.js.
// Runs before React renders so a fresh-launch update reloads while there is still
// nothing to lose. See CLAUDE.md §13.
initPwaUpdates();

// Only React + CSS are imported above this line — no app code, no Supabase.
// URL detection therefore runs before any app module has had a chance to load.
const _p        = new URLSearchParams(window.location.search);
const _isJoin   = window.location.pathname.replace(/\/$/, '') === '/join';
const _isGuest  = !_isJoin && _p.get('guest') === '1';
const _centreId = _p.get('c') || null;
const _currency = _p.get('cur') || 'GHS';

// Both entry points are lazy — only the matching one ever loads.
// Guest path  → GuestPortal (+ anon Supabase client).  App.jsx never imports.
// Owner path  → App (+ auth Supabase client).           GuestPortal never imports.
const LazyApp = lazy(() => import('./App.jsx'));
const LazyGuest = lazy(() =>
  import('./views/GuestPortal.jsx').then(m => ({ default: m.GuestPortal }))
);

function Root() {
  // UpdateToast sits outside the Suspense boundary: one mount serves both the
  // owner app and the guest portal, and neither has to import the other for it.
  return (
    <>
      <Suspense fallback={null}>
        {_isGuest
          ? <LazyGuest centreId={_centreId} currency={_currency} />
          : <LazyApp />}
      </Suspense>
      <UpdateToast />
    </>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
