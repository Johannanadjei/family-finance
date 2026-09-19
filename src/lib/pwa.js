/**
 * lib/pwa.js
 *
 * Two PWA-lifecycle concerns.
 *
 * 1. Install prompt — shared store for the beforeinstallprompt deferred event.
 *    Captured at page load (before React renders) so it is never missed.
 *    Components read getInstallPrompt() and call triggerInstall().
 *
 * 2. Update lifecycle — initPwaUpdates() owns service-worker registration.
 *    See CLAUDE.md §13 "PWA update lifecycle".
 */

import { registerSW } from 'virtual:pwa-register';

// ── Install prompt ─────────────────────────────────────────────────────────

let _prompt = null;

export const setInstallPrompt   = (e)  => { _prompt = e; };
export const getInstallPrompt   = ()   => _prompt;
export const clearInstallPrompt = ()   => { _prompt = null; };

export const triggerInstall = async () => {
  if (!_prompt) return { outcome: null };
  _prompt.prompt();
  const { outcome } = await _prompt.userChoice;
  if (outcome === 'accepted') clearInstallPrompt();
  return { outcome };
};

// ── Update lifecycle ───────────────────────────────────────────────────────

const LAUNCH_TS       = Date.now();
const FRESH_LAUNCH_MS = 15000;
const UPDATE_EVENT    = 'pwaUpdateReady';
const PRELOAD_KEY     = 'bos:preload-reloaded';
const UPDATE_CHECK_MS = 60 * 60 * 1000;

const _api = { reload: () => window.location.reload() };

let _initialised = false;
let _handled     = false;   // one update decision per page load

/**
 * What a freshly-activated service worker does to this page.
 * Fresh launch → reload now; the user has typed nothing and lost nothing.
 * Long session → dispatch pwaUpdateReady; UpdateToast lets them pick the moment.
 *
 * Both workbox's `activated` (via onNeedReload) and the raw `controllerchange`
 * land here. The latch means whichever fires first wins and the other is a no-op.
 * The latch is per PAGE LOAD, so a second deploy activating in the same long
 * session raises no second toast until the user reloads. Accepted — see CLAUDE.md §13.
 */
function onUpdateActivated() {
  if (_handled) return;
  _handled = true;
  if (Date.now() - LAUNCH_TS < FRESH_LAUNCH_MS) {
    window.location.reload();
  } else {
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
  }
}

export function initPwaUpdates() {
  if (_initialised) return _api;
  _initialised = true;

  // Getting this far means the chunks loaded — release the preload circuit-breaker
  // so the NEXT deploy's first chunk failure still gets its one recovery reload.
  setTimeout(() => {
    try { sessionStorage.removeItem(PRELOAD_KEY); } catch { /* storage blocked */ }
  }, 5000);

  registerSW({
    immediate: true,
    // REQUIRED. Without it, autoUpdate's own `activated` handler calls
    // window.location.reload() unconditionally and the toast path never runs.
    // Verified in vite-plugin-pwa/dist/client/build/register.js:42-43.
    onNeedReload: onUpdateActivated,
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => reg.update().catch(() => {});
      setInterval(check, UPDATE_CHECK_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
  });

  // Backstop for updates workbox-window doesn't see as `activated` — an external
  // update, or another tab's SW taking control via clientsClaim().
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', onUpdateActivated);
  }

  // A precached chunk that 404s after a deploy is the ChunkLoadError path.
  // Reload once to pick up the new index.html. The sessionStorage flag stops a
  // genuinely-broken deploy from becoming an infinite reload loop.
  window.addEventListener('vite:preloadError', (e) => {
    e.preventDefault();
    let alreadyReloaded;
    try {
      alreadyReloaded = sessionStorage.getItem(PRELOAD_KEY) === '1';
      if (!alreadyReloaded) sessionStorage.setItem(PRELOAD_KEY, '1');
    } catch {
      // No sessionStorage → no guard. A missed recovery beats a reload loop.
      alreadyReloaded = true;
    }
    if (!alreadyReloaded) window.location.reload();
  });

  return _api;
}
