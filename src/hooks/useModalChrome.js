/**
 * hooks/useModalChrome.js
 *
 * Shared "chrome" behaviour for every bottom-sheet / drawer modal:
 *   1. Body scroll-lock while any modal is open.
 *   2. `inert` on the app-shell root so background content is non-interactive
 *      AND removed from the a11y tree. Modals are portalled to <body> (outside
 *      the inerted root), so the modal itself stays interactive.
 *   3. Back-button intercept — pushes a dummy history entry on open so the
 *      device/browser back button pops it (closing the modal) instead of
 *      navigating the underlying page.
 *
 * Call once per modal, ABOVE the component's `if (!isOpen) return null` guard
 * (hooks-order rule). The sheet must also wrap its render in
 * `createPortal(..., document.body)` so the inerted root doesn't disable it.
 */

import { useEffect, useRef } from 'react';

const ROOT_ID = 'app-shell';

// Module-level coordinator — shared across every modal instance (and across
// StrictMode's transient setup→cleanup→setup remount, where per-instance refs
// persist but the effect re-runs). Only the LAST modal to close restores scroll
// and removes inert.
let openCount     = 0;
let savedOverflow = null;

export function useModalChrome({ isOpen, onClose }) {
  const appliedRef   = useRef(false); // did THIS instance take the lock?
  const entryLiveRef = useRef(false); // does THIS instance still own a history entry?
  const onCloseRef   = useRef(onClose);
  onCloseRef.current = onClose; // keep latest without re-running the effect

  useEffect(() => {
    if (!isOpen) return undefined;

    const body = document.body;
    const root = document.getElementById(ROOT_ID);

    // --- acquire lock (idempotent per instance; symmetric with cleanup → StrictMode-safe) ---
    if (!appliedRef.current) {
      appliedRef.current = true;
      if (openCount === 0) {
        savedOverflow = body.style.overflow;
        body.style.overflow = 'hidden';
        if (root) root.inert = true;
      }
      openCount += 1;
    }

    // --- back-button intercept: push our dummy entry ---
    entryLiveRef.current = true;
    window.history.pushState({ __modalChrome: true }, '');

    const onPop = () => {
      entryLiveRef.current = false;             // user pressed back: browser already popped our entry
      onCloseRef.current?.();                   // ...so close, and do NOT call history.back() again
    };
    window.addEventListener('popstate', onPop);

    return () => {
      window.removeEventListener('popstate', onPop);

      // --- release lock (idempotent per instance) ---
      if (appliedRef.current) {
        appliedRef.current = false;
        openCount -= 1;
        if (openCount === 0) {
          body.style.overflow = savedOverflow ?? '';
          savedOverflow = null;
          if (root) root.inert = false;
        }
      }

      // --- reconcile history (programmatic close OR unmount-while-open) ---
      // KNOWN LIMITATION (accepted): history.back() always pops the *top* entry.
      // If an underlying modal is closed programmatically while a modal opened on
      // top of it is still open, this pops the TOP modal's entry, not ours. The
      // app's current flows are hand-offs (e.g. SidePanel closes as CreateHub
      // opens), so true simultaneous stacking with out-of-order close does not
      // occur. Not guarded here — would require entry-keyed history tracking.
      // Revisit only if a genuinely stacked, independently-closeable modal pair
      // is introduced.
      if (entryLiveRef.current) {
        entryLiveRef.current = false;

        // The back() below fires a synthetic popstate we must NOT mistake for a
        // user back-press — otherwise it would close whatever modal is now
        // listening. A one-shot listener swallows exactly that one event via
        // stopImmediatePropagation, then auto-removes (`once`). This replaces the
        // old module-level `selfPop` flag, which a modal opening in the SAME
        // commit (a hand-off) would reset before the synthetic popstate landed —
        // closing the incoming modal the instant it opened.
        //
        // Why this swallower beats any modal's onPop to the event: popstate's
        // target is `window`, so dispatch is AT_TARGET, where listeners fire in
        // REGISTRATION order (the `capture: true` flag grants NO precedence here
        // — it's kept only as harmless intent-signalling). React's effect
        // contract runs all cleanups before any setups, so on a hand-off this
        // cleanup (registering the swallower) runs before the incoming modal's
        // setup registers its onPop — the swallower is therefore registered
        // first and runs first. It does NOT stop react-router's popstate handler
        // (registered at app mount, so earlier still), but that's benign: our
        // dummy entries keep the same URL, so the router re-renders a no-op.
        const swallow = (e) => { e.stopImmediatePropagation(); };
        window.addEventListener('popstate', swallow, { capture: true, once: true });
        window.history.back();
      }
    };
  }, [isOpen]);
}
