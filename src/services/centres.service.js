/**
 * services/centres.service.js
 *
 * All Supabase read/write operations for budget_centres.
 * Member operations live in members.service.js.
 *
 * RULES:
 * - Every select filters deleted_at is null
 * - Every delete is soft — sets deleted_at = now()
 * - Every error is logged with table and operation
 * - Validation runs before every insert/update
 * - Never throws — always returns { data, error }
 */

import { supabase } from '../lib/supabase';
import { validateString, validateCurrency } from '../lib/validation';
import { warnOnEmptyColdLoad } from '../lib/auth';

// ── Budget Centres ────────────────────────────────────────────────────────────

/**
 * Fetch all budget centres the current user belongs to.
 * Ordered by creation date ascending — first centre is the primary one.
 */
export const getCentres = async () => {
  const { data, error } = await supabase
    .from('budget_centres')
    .select('*')
    .is('deleted_at', null)
    .eq('is_archived', false)
    .order('created_at', { ascending: true });

  if (error) console.error('[centres.service] getCentres error:', error.message);
  // Never mask a failure as []: error → data null; success → always an array. See CLAUDE.md §12.
  return { data: error ? null : (data || []), error };
};

/**
 * Fetch a single budget centre by ID.
 */
export const getCentreById = async (centreId) => {
  const { data, error } = await supabase
    .from('budget_centres')
    .select('*')
    .eq('id', centreId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) console.error('[centres.service] getCentreById error:', error.message);
  if (!error) warnOnEmptyColdLoad('budget_centres (by id)', data ? [data] : []);
  return { data, error };
};

/**
 * Fetch the first active, non-archived budget centre for the current user.
 * Used as the initial load fallback when no explicit centreId is provided.
 */
export const getFirstCentre = async () => {
  const { data, error } = await supabase
    .from('budget_centres')
    .select('*')
    .is('deleted_at', null)
    .eq('is_archived', false)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) console.error('[centres.service] getFirstCentre error:', error.message);
  if (!error) warnOnEmptyColdLoad('budget_centres (first)', data ? [data] : []);
  return { data, error };
};

/** Friendly, user-facing copy for a plan hub-cap rejection (HUB01). */
const HUB_CAP_MESSAGE =
  "You've reached your plan's hub limit. Free accounts can have 1 hub. Upgrade to Pro to manage up to 10 hubs.";

/**
 * Create a new budget centre and its owner member row.
 *
 * Delegates to the create_hub SECURITY DEFINER RPC (scripts/create_hub.sql), which
 * (a) enforces the per-tier hub cap server-side — rejecting with SQLSTATE 'HUB01'
 * if the caller is at their limit — and (b) inserts the centre + owner member row
 * atomically (fixing the old client-side 2-insert orphan bug). The client-side
 * gate is UX only; this RPC is the real enforcement.
 *
 * On a cap rejection the returned Error carries `error.code === 'HUB01'` so callers
 * can open the upgrade modal and/or show HUB_CAP_MESSAGE.
 *
 * @param {{ name, currency, surplus_target, icon, type, skin_id }} opts
 */
export const createCentre = async ({ name, currency, surplus_target = 0, icon = '🏠', type = 'family_home', skin_id = null }) => {
  const { data: { user } = {}, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return { data: null, error: authErr || new Error('Not authenticated') };

  // Validate inputs (fail fast, no network round-trip; RPC re-validates server-side).
  try {
    validateString(name, 'name');
    validateCurrency(currency);
  } catch (e) {
    console.error('[centres.service] createCentre validation error:', e.message);
    return { data: null, error: e };
  }

  const { data, error } = await supabase.rpc('create_hub', {
    p_name:           name.trim(),
    p_currency:       currency,
    p_surplus_target: Math.round(Math.max(0, Number(surplus_target) || 0)),
    p_icon:           icon || '🏠',
    p_type:           type || 'family_home',
    p_skin_id:        skin_id || null,
  });

  if (error) {
    if (error.code === 'HUB01') {
      // Plan cap hit — map to friendly copy + keep the code so callers can react.
      const capErr = new Error(HUB_CAP_MESSAGE);
      capErr.code = 'HUB01';
      console.error('[centres.service] createCentre cap reached (HUB01)');
      return { data: null, error: capErr };
    }
    console.error('[centres.service] createCentre RPC error:', error.message);
    return { data: null, error };
  }

  return { data, error: null };
};

/**
 * Update a budget centre's name, currency, surplus target, or icon.
 */
export const updateCentre = async (centreId, updates) => {
  const cleaned = {};

  try {
    if (updates.name     !== undefined) cleaned.name           = validateString(updates.name, 'name');
    if (updates.currency !== undefined) cleaned.currency       = validateCurrency(updates.currency);
    if (updates.surplus_target !== undefined) cleaned.surplus_target = Math.round(Math.max(0, Number(updates.surplus_target) || 0));
    if (updates.icon     !== undefined) cleaned.icon           = updates.icon || '🏠';
    if (updates.skin_id  !== undefined) cleaned.skin_id        = updates.skin_id;
    if (updates.type     !== undefined) cleaned.type           = updates.type;
    if (updates.timezone !== undefined) cleaned.timezone       = String(updates.timezone);
  } catch (e) {
    console.error('[centres.service] updateCentre validation error:', e.message);
    return { data: null, error: e };
  }

  // .maybeSingle() — an UPDATE can match zero rows when RLS blocks the write, which
  // returns { data: null, error: null } (permission-denied-without-exception), not a
  // 406. .single() would coerce that to a 406 "Cannot coerce the result to a single
  // JSON object". The wrapper in useBudgetCentre treats a null data here as a no-op.
  const { data, error } = await supabase
    .from('budget_centres')
    .update(cleaned)
    .eq('id', centreId)
    .is('deleted_at', null)
    .select()
    .maybeSingle();

  if (error) console.error('[centres.service] updateCentre error:', error.message);
  return { data, error };
};

// Friendly copy for a plan skin-gate rejection (SKN01).
const SKIN_CAP_MESSAGE = "You've reached your plan's skin limit. Free hubs use the family_warmth skin. Upgrade to Pro to unlock all skins.";

/**
 * Change a centre's theme skin via the update_centre_skin SECURITY DEFINER RPC —
 * the only budget_centres field gated against the OWNER's tier (free hubs may only
 * use 'family_warmth'), which RLS can't express. SQLSTATE 'SKN01' → friendly copy
 * with `error.code` preserved so callers open the upgrade modal. RPC is the real
 * enforcement; the greyed chips are UX only. See scripts/update_centre_skin.sql.
 */
export const updateCentreSkin = async (centreId, skinId) => {
  const { data, error } = await supabase.rpc('update_centre_skin', {
    p_centre_id: centreId,
    p_skin_id:   skinId,
  });

  if (error) {
    if (error.code === 'SKN01') {
      const capErr = new Error(SKIN_CAP_MESSAGE);
      capErr.code = 'SKN01';
      console.error('[centres.service] updateCentreSkin cap reached (SKN01)');
      return { data: null, error: capErr };
    }
    console.error('[centres.service] updateCentreSkin RPC error:', error.message);
    return { data: null, error };
  }

  return { data, error: null };
};

/**
 * Soft delete a budget centre.
 */
export const deleteCentre = async (centreId) => {
  const { error } = await supabase
    .from('budget_centres')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', centreId);

  if (error) console.error('[centres.service] deleteCentre error:', error.message);
  return { error };
};

/**
 * Fetch all archived (but not deleted) budget centres for the current user.
 */
export const getArchivedCentres = async () => {
  const { data, error } = await supabase
    .from('budget_centres')
    .select('*')
    .is('deleted_at', null)
    .eq('is_archived', true)
    .order('created_at', { ascending: true });

  if (error) console.error('[centres.service] getArchivedCentres error:', error.message);
  return { data: error ? null : (data || []), error };
};

/**
 * Restore an archived budget centre — sets is_archived = false.
 */
export const unarchiveCentre = async (centreId) => {
  const { error } = await supabase
    .from('budget_centres')
    .update({ is_archived: false })
    .eq('id', centreId);

  if (error) console.error('[centres.service] unarchiveCentre error:', error.message);
  return { error };
};

/**
 * Archive a budget centre — sets is_archived and soft-deletes.
 */
export const archiveCentre = async (centreId) => {
  const { error } = await supabase
    .from('budget_centres')
    .update({ is_archived: true })
    .eq('id', centreId);

  if (error) console.error('[centres.service] archiveCentre error:', error.message);
  return { error };
};

// Plan tier resolution moved to services/subscriptions.service.js + useSubscription
// (subscriptions table is the source of truth; no row → free). The old getUserPlan
// (users.plan) read was removed in the Pro subscription foundation commit.

