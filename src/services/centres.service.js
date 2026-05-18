/**
 * services/centres.service.js
 *
 * All Supabase read/write operations for budget_centres
 * and budget_centre_members.
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
    .order('created_at', { ascending: true });

  if (error) console.error('[centres.service] getCentres error:', error.message);
  return { data: data || [], error };
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
  return { data, error };
};

/**
 * Create a new budget centre.
 * Also creates the owner member row in budget_centre_members.
 *
 * @param {{ name, currency, surplus_target, icon }} opts
 */
export const createCentre = async ({ name, currency, surplus_target = 0, icon = '🏠' }) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: new Error('Not authenticated') };

  // Validate inputs
  try {
    validateString(name, 'name');
    validateCurrency(currency);
  } catch (e) {
    console.error('[centres.service] createCentre validation error:', e.message);
    return { data: null, error: e };
  }

  // Insert centre
  const { data: centre, error: centreErr } = await supabase
    .from('budget_centres')
    .insert({
      name:           name.trim(),
      currency,
      surplus_target: Math.round(Math.max(0, Number(surplus_target) || 0)),
      icon:           icon || '🏠',
      owner_id:       user.id,
    })
    .select()
    .single();

  if (centreErr) {
    console.error('[centres.service] createCentre insert error:', centreErr.message);
    return { data: null, error: centreErr };
  }

  // Insert owner member row
  const { error: memberErr } = await supabase
    .from('budget_centre_members')
    .insert({
      budget_centre_id: centre.id,
      user_id:          user.id,
      role:             'owner',
    });

  if (memberErr) {
    console.error('[centres.service] createCentre member insert error:', memberErr.message);
    // Centre was created — return it even if member row failed
    // The owner SELECT policy will still allow reads
    return { data: centre, error: memberErr };
  }

  return { data: centre, error: null };
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
  } catch (e) {
    console.error('[centres.service] updateCentre validation error:', e.message);
    return { data: null, error: e };
  }

  const { data, error } = await supabase
    .from('budget_centres')
    .update(cleaned)
    .eq('id', centreId)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) console.error('[centres.service] updateCentre error:', error.message);
  return { data, error };
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

// ── Budget Centre Members ─────────────────────────────────────────────────────

/**
 * Fetch all active members of a budget centre.
 * Includes user profile data.
 */
export const getMembers = async (centreId) => {
  const { data, error } = await supabase
    .from('budget_centre_members')
    .select('*, users(id, name, email, avatar_url)')
    .eq('budget_centre_id', centreId)
    .is('deleted_at', null);

  if (error) console.error('[centres.service] getMembers error:', error.message);
  return { data: data || [], error };
};

/**
 * Invite a user to a budget centre by user ID.
 * The inviting user must be the owner.
 */
export const addMember = async (centreId, userId) => {
  const { data, error } = await supabase
    .from('budget_centre_members')
    .insert({
      budget_centre_id: centreId,
      user_id:          userId,
      role:             'member',
    })
    .select()
    .single();

  if (error) console.error('[centres.service] addMember error:', error.message);
  return { data, error };
};

/**
 * Remove a member from a budget centre (soft delete).
 */
export const removeMember = async (memberId) => {
  const { error } = await supabase
    .from('budget_centre_members')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', memberId);

  if (error) console.error('[centres.service] removeMember error:', error.message);
  return { error };
};
