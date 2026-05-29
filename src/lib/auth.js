/**
 * lib/auth.js
 *
 * Auth-readiness gate. Guarantees a VALID, non-expired Supabase session
 * BEFORE any data query fires on cold load.
 *
 * Root cause this prevents (data-loss-on-refresh):
 *   On a cold refresh the data hooks fired PostgREST queries off session.user
 *   before the access token was attached/refreshed. RLS-blocked queries return
 *   HTTP 200 with [] (no error), which the app rendered as "no data". A second
 *   refresh worked because the session was warm by then.
 *
 * waitForSession() blocks the first fetch until the token is present AND fresh:
 *   - getSession() (awaits the GoTrue init lock in supabase-js v2)
 *   - if no session yet → bounded poll (a session can take a render cycle to
 *     propagate after sign-in)
 *   - if present but expired/expiring → refreshSession() before returning
 *
 * Never throws — always returns { data: session | null, error }.
 */

import { supabase } from './supabase';

const RETRY_GAP_MS  = 500;
const EXPIRY_SKEW_S = 30; // treat a token expiring within 30s as stale → refresh

const isExpired = (session) => {
  if (!session?.expires_at) return false;
  const nowS = Math.floor(Date.now() / 1000);
  return session.expires_at <= nowS + EXPIRY_SKEW_S;
};

// Records when an authenticated session was first observed this page-load.
// Used by the cold-load empty-result canary (warnOnEmptyColdLoad).
let _sessionSeenAt = null;
const markSessionSeen = () => { if (_sessionSeenAt === null) _sessionSeenAt = Date.now(); };

/** Milliseconds since an authenticated session was first observed (0 if never). */
export const sessionAgeMs = () => (_sessionSeenAt === null ? 0 : Date.now() - _sessionSeenAt);

/**
 * Resolve once a valid, fresh session is available.
 * @param {number} maxAttempts — how many times to poll for a session before giving up
 * @returns {Promise<{ data: object|null, error: Error|null }>}
 */
export const waitForSession = async (maxAttempts = 3) => {
  for (let i = 0; i < maxAttempts; i++) {
    const { data, error } = await supabase.auth.getSession();
    if (error) return { data: null, error };

    const session = data?.session;
    if (session) {
      markSessionSeen();
      if (isExpired(session)) {
        const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
        if (refreshErr) return { data: null, error: refreshErr };
        return { data: refreshed?.session ?? session, error: null };
      }
      return { data: session, error: null };
    }

    // No session yet — wait a render cycle and retry (never sleep after the last attempt)
    if (i < maxAttempts - 1) await new Promise((resolve) => setTimeout(resolve, RETRY_GAP_MS));
  }
  return { data: null, error: new Error('Session not established') };
};

/**
 * Cold-load smoke detector. Logs a console.warn when a fetch comes back empty
 * for a user who has held a session for >1s — the signature of a residual
 * RLS/auth race (the data-loss-on-refresh class). Cheap canary, dev-only signal.
 *
 * Genuinely-empty accounts can also trip this; the message says "possible".
 *
 * @param {string} label — table / query name for the log line
 * @param {Array|null} data — the rows returned by the query
 */
export const warnOnEmptyColdLoad = (label, data) => {
  const count = data?.length ?? 0;
  const age   = sessionAgeMs();
  if (count === 0 && age > 1000) {
    console.warn(`[auth canary] ${label} returned empty ${age}ms after session established — possible RLS/auth race (data-loss-on-refresh class).`);
  }
};
