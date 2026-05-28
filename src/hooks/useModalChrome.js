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
let selfPop       = false; // true only while WE are the ones calling history.back()

export function useModalChrome({ isOpen, onClose }) {
  const appliedRef   = useRef(false); // did THIS instance take the lock?
  const entryLiveRef = useRef(false); // does THIS instance still own a history entry?
  const onCloseRef   = useRef(onClose);
  onCloseRef.current = onClose; // keep latest without re-running the effect

  useEffect(() => {
    if (!isOpen) return undefined;

    const body = document.body;
    const root = document.getElementById(ROOT_ID);

    // Clear any stale self-pop flag from a prior close. The back() we fire on a
    // programmatic close generates a popstate, but by then this instance's
    // listener is already removed; in the single-modal case nothing consumes the
    // flag, so it would otherwise linger true and swallow the NEXT modal's first
    // real back-press. Resetting here guarantees a freshly-opened modal honours
    // back. (Stacked closes self-heal: the underlying modal's listener consumes
    // it.) The only residual race — a stale in-flight back()-popstate landing
    // after a new modal opens in the same tick — requires opening a modal within
    // ~1ms of closing another, which no human interaction produces.
    selfPop = false;

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
      if (selfPop) { selfPop = false; return; } // our own back() — swallow, don't close
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
        selfPop = true;          // mark so our own popstate handler swallows this back()
        window.history.back();
      }
    };
  }, [isOpen]);
}
