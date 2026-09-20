/**
 * components/ui/PullToRefresh.jsx
 *
 * Touch pull-to-refresh for the dashboard. Mounted ONCE in DashboardShell around
 * the routed <main>, which is what Home / Payday / Daily / Budget / Log all render
 * into — the app scrolls the DOCUMENT (no view has its own overflow container), so
 * there is one scroller and it needs one gesture.
 *
 * ── The gesture ──────────────────────────────────────────────────────────────
 *   arm    — touchstart while the document is at scrollTop 0 (and not already
 *            refreshing, and not disabled)
 *   track  — downward drag, damped by RESISTANCE and capped at MAX_PULL
 *   fire   — release at or past THRESHOLD → onRefresh(); anything less snaps back
 *
 * An upward drag, or any movement once the page has scrolled away from the top,
 * disarms immediately — so a normal scroll that happens to begin at the top never
 * turns into a refresh.
 *
 * ── Why the content does not move ────────────────────────────────────────────
 * The indicator slides down OVER the content instead of pushing it. Translating
 * the wrapper would make it a containing block for any `position: fixed`
 * descendant (BudgetHeader's menu backdrop is one), shifting it mid-gesture. An
 * overlay indicator has no such coupling and is the same affordance.
 *
 * ── Why the listeners are manual ─────────────────────────────────────────────
 * React attaches touchmove PASSIVELY at the root, where preventDefault() is a
 * no-op. We need it to suppress the browser's own overscroll during a pull, so the
 * listeners are registered on the element with { passive: false } — the same
 * reason useModalChrome registers its touchmove by hand.
 *
 * ── Why it cannot fight the sheets ───────────────────────────────────────────
 * Every bottom sheet is createPortal(..., document.body), i.e. outside this
 * wrapper, so a drag on an open sheet never reaches these listeners. There are no
 * other touch gestures in the app (no swipe-to-dismiss, no carousels) — this is
 * the first and only one. `disabled` remains available for a future conflict.
 */

import { useEffect, useRef, useState } from 'react';

export const THRESHOLD  = 70;   // px of damped pull required to fire
const MAX_PULL          = 110;  // px the indicator can travel
const RESISTANCE        = 0.5;  // damping applied to raw finger travel
const SPINNER_HOLD      = 56;   // px the indicator rests at while refreshing

// The document is the scroller (see index.css — html/body carry
// overscroll-behavior: none and no view sets overflow).
const docScrollTop = () =>
  document.scrollingElement?.scrollTop ?? document.documentElement?.scrollTop ?? 0;

export function PullToRefresh({ onRefresh, disabled = false, children }) {
  const hostRef             = useRef(null);
  const startY              = useRef(0);
  const armed               = useRef(false);
  const [pull,      setPull]       = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // onEnd reads the pull distance at RELEASE time, so it needs a ref rather than
  // the value captured when the listeners were registered once on mount.
  const pullRef = useRef(0);
  pullRef.current = pull;

  // Latest values for the manual listeners, which are registered once.
  const stateRef = useRef({ onRefresh, disabled, refreshing });
  stateRef.current = { onRefresh, disabled, refreshing };

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return undefined;

    const onStart = (e) => {
      const { disabled: off, refreshing: busy } = stateRef.current;
      if (off || busy || e.touches.length !== 1 || docScrollTop() > 0) { armed.current = false; return; }
      armed.current = true;
      startY.current = e.touches[0].clientY;
    };

    const onMove = (e) => {
      if (!armed.current) return;
      const dy = e.touches[0].clientY - startY.current;
      // Scrolled away from the top mid-gesture, or pulling upward: this is a
      // scroll, not a refresh. Disarm rather than compete with it.
      if (dy <= 0 || docScrollTop() > 0) { armed.current = false; setPull(0); return; }
      if (e.cancelable) e.preventDefault();   // suppress the browser's overscroll
      setPull(Math.min(MAX_PULL, dy * RESISTANCE));
    };

    const onEnd = async () => {
      if (!armed.current) return;
      armed.current = false;
      const travelled = pullRef.current;
      if (travelled < THRESHOLD) { setPull(0); return; }
      setRefreshing(true);
      setPull(SPINNER_HOLD);
      // Catch, don't just finally: an onRefresh that rejects would otherwise
      // escape this async listener as an unhandled rejection. The refresh failing
      // is already surfaced by the hub's own error state (the retry banner);
      // here we only have to make sure the spinner stops.
      try { await stateRef.current.onRefresh?.(); }
      catch (err) { console.error('[PullToRefresh] refresh failed:', err?.message || err); }
      finally { setRefreshing(false); setPull(0); }
    };

    const onCancel = () => { armed.current = false; setPull(0); };

    el.addEventListener('touchstart',  onStart,  { passive: true });
    el.addEventListener('touchmove',   onMove,   { passive: false });
    el.addEventListener('touchend',    onEnd,    { passive: true });
    el.addEventListener('touchcancel', onCancel, { passive: true });

    return () => {
      el.removeEventListener('touchstart',  onStart);
      el.removeEventListener('touchmove',   onMove);
      el.removeEventListener('touchend',    onEnd);
      el.removeEventListener('touchcancel', onCancel);
    };
  }, []);

  const ready = pull >= THRESHOLD;

  return (
    <div ref={hostRef} style={{ position: 'relative' }}>
      {pull > 0 && (
        <div
          data-testid="ptr-indicator"
          role="status"
          aria-live="polite"
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: pull, pointerEvents: 'none',
            transition: armed.current ? 'none' : 'height .2s ease',
          }}
        >
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--c-card, #ffffff)', boxShadow: 'var(--c-shadow)',
            color: ready || refreshing ? 'var(--c-accent, #059669)' : 'var(--c-muted, #6b7280)',
            transition: 'color .15s',
          }}>
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
              aria-hidden="true"
              style={refreshing
                ? { animation: 'spin .8s linear infinite' }
                : { transform: `rotate(${Math.min(180, (pull / THRESHOLD) * 180)}deg)`, transition: 'transform .05s linear' }}
            >
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
          </div>
          <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
            {refreshing ? 'Refreshing' : ready ? 'Release to refresh' : 'Pull to refresh'}
          </span>
        </div>
      )}
      {children}
    </div>
  );
}
