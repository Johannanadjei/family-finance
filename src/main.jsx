import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { GuestPortal } from './views/GuestPortal.jsx';

// Gate 0 — Guest portal. Checked before any auth hooks run so that
// anonymous household members can log expenses without a Supabase account.
function Root() {
  const params   = new URLSearchParams(window.location.search);
  const isGuest  = params.get('guest') === '1';
  const centreId = params.get('c') || null;
  const currency = params.get('cur') || 'GHS';

  if (isGuest) return <GuestPortal centreId={centreId} currency={currency} />;
  return <App />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>
);

// Register service worker for PWA support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then(() => {})
      .catch((err) => console.warn('SW registration failed:', err));
  });
}
