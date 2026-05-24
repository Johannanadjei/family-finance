import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { GuestPortal } from './views/GuestPortal.jsx';

// Detect guest mode at module scope — before any imports from App run.
// This ensures App.jsx (and its Supabase auth chain) is never loaded for guest sessions.
const _p        = new URLSearchParams(window.location.search);
const _isGuest  = _p.get('guest') === '1';
const _centreId = _p.get('c') || null;
const _currency = _p.get('cur') || 'GHS';

// Lazy-load App so its modules are never fetched when guest=1 is in the URL
const App = lazy(() => import('./App.jsx'));

function Root() {
  if (_isGuest) return <GuestPortal centreId={_centreId} currency={_currency} />;
  return <Suspense fallback={null}><App /></Suspense>;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then(() => {})
      .catch((err) => console.warn('SW registration failed:', err));
  });
}
