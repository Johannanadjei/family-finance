/**
 * components/ui/UpdateToast.jsx
 *
 * "A new version is ready" banner. Listens for the pwaUpdateReady event that
 * lib/pwa.js dispatches when a new service worker activates mid-session.
 *
 * Mounted once in main.jsx outside both lazy entry points, so the owner app and
 * the guest portal behave identically without either importing the other.
 * Persistent (autoDismissMs={null}) — the user picks the moment to reload.
 *
 * See CLAUDE.md §13 "PWA update lifecycle".
 */

import { useState, useEffect } from 'react';
import { Toast }               from './Toast';

export function UpdateToast() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const onReady = () => setReady(true);
    window.addEventListener('pwaUpdateReady', onReady);
    return () => window.removeEventListener('pwaUpdateReady', onReady);
  }, []);

  if (!ready) return null;

  return (
    <Toast
      message="A new version of Money B.O.S is ready"
      actionLabel="Reload"
      onEdit={() => window.location.reload()}
      onDismiss={() => setReady(false)}
      autoDismissMs={null}
    />
  );
}
