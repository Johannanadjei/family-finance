/**
 * services/subscriptions.service.js
 *
 * Supabase read for the subscriptions table + pure tier resolution.
 *
 * RULES (CLAUDE.md §6 / §12):
 * - Every select filters deleted_at is null
 * - Filters user_id (defense-in-depth alongside the own-row RLS policy)
 * - Never throws — always returns { data, error }
 * - Truthful errors — never mask a failed fetch as data:null with no error
 *
 * Writes are intentionally absent: the subscriptions table has no client write
 * policy. All mutations come from the Paystack webhook handler running as
 * service-role (CLAUDE.md §9.6). The webhook UPDATEs the existing row per user
 * rather than inserting duplicates (one-active-per-user partial unique index).
 */

import { supabase } from '../lib/supabase';

/**
 * Fetch the caller's current (non-deleted) subscription row, newest first.
 * Returns { data: row|null, error }. A null row with no error means "no
 * subscription" → the resolver treats that as free.
 *
 * @param {string} userId
 * @returns {Promise<{ data: object|null, error: any }>}
 */
export const getCurrentSubscription = async (userId) => {
  if (!userId) return { data: null, error: null };

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) console.error('[subscriptions.service] getCurrentSubscription error:', error.message);
  return { data, error };
};

/**
 * Pure resolution of a subscription row into the app's plan view. No DB, no React.
 *
 * Rules:
 * - no row                                  → free
 * - status !== 'active'                      → free (canceled, past_due, incomplete)
 * - status 'active' but period already ended → free (expired)
 * - status 'active' and period still open    → that row's tier (Pro). This covers
 *   a cancel-at-period-end row: it stays Pro until current_period_end passes.
 *
 * @param {object|null} row — a subscriptions row, or null
 * @param {Date} [now] — injected for testability; defaults to new Date()
 * @returns {{ subscription: object|null, tier: 'free'|'pro', isActive: boolean, isPro: boolean }}
 */
export const resolveSubscription = (row, now = new Date()) => {
  if (!row) return { subscription: null, tier: 'free', isActive: false, isPro: false };

  const periodOpen = !row.current_period_end || new Date(row.current_period_end) > now;
  const isActive   = row.status === 'active' && periodOpen;
  const tier       = isActive ? (row.tier || 'free') : 'free';
  const isPro      = tier === 'pro';

  return { subscription: row, tier, isActive, isPro };
};
