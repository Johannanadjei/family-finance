import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { setInstallPrompt } from './lib/pwa';

// Capture beforeinstallprompt immediately — before React renders.
// Stored in lib/pwa.js so InstallPrompt can read it even if it mounts after the event fired.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  setInstallPrompt(e);
  window.dispatchEvent(new CustomEvent('pwaInstallReady'));
});

// Only React + CSS are imported above this line — no app code, no Supabase.
// URL detection therefore runs before any app module has had a chance to load.
const _p        = new URLSearchParams(window.location.search);
const _isGuest  = _p.get('guest') === '1';
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
  if (_isGuest) {
    return (
      <Suspense fallback={null}>
        <LazyGuest centreId={_centreId} currency={_currency} />
      </Suspense>
    );
  }
  return <Suspense fallback={null}><LazyApp /></Suspense>;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
