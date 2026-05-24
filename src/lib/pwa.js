/**
 * lib/pwa.js
 *
 * Shared store for the beforeinstallprompt deferred event.
 * Captured at page load (before React renders) so it is never missed.
 * Components read getInstallPrompt() and call triggerInstall() to show the OS dialog.
 */

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
