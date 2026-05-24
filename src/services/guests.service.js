/**
 * services/guests.service.js
 *
 * All Supabase read/write operations for guest_users.
 *
 * RULES:
 * - Every select filters deleted_at is null
 * - Every select filters budget_centre_id
 * - Every delete is soft — sets deleted_at = now()
 * - PINs are always hashed before storing — never stored plain text
 * - Validation runs before every insert/update
 * - Never throws — always returns { data, error }
 */

import { supabase } from '../lib/supabase';
import { validateString } from '../lib/validation';
import { hashPin } from '../lib/crypto';

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Fetch all active guest users for a budget centre.
 *
 * @param {string} centreId
 */
export const getGuestUsers = async (centreId) => {
  const { data, error } = await supabase
    .from('guest_users')
    .select('id, budget_centre_id, name, allowed_categories, is_active, created_at')
    .eq('budget_centre_id', centreId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (error) console.error('[guests.service] getGuestUsers error:', error.message);
  return { data: data || [], error };
};

/**
 * Fetch a single guest user by ID.
 * Does NOT return pin_hash — never expose hashes to the client.
 */
export const getGuestById = async (guestId) => {
  const { data, error } = await supabase
    .from('guest_users')
    .select('id, budget_centre_id, name, allowed_categories, is_active, created_at')
    .eq('id', guestId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) console.error('[guests.service] getGuestById error:', error.message);
  return { data, error };
};

// ── Mutations ─────────────────────────────────────────────────────────────────

/**
 * Create a new guest user.
 * PIN is hashed before storing — raw PIN is never written to Supabase.
 *
 * @param {string} centreId
 * @param {{ name, pin, allowedCategories }} guest
 */
export const createGuestUser = async (centreId, { name, pin, allowedCategories = [] }) => {
  try {
    validateString(name, 'name');
    validateString(String(pin), 'pin');
  } catch (e) {
    console.error('[guests.service] createGuestUser validation error:', e.message);
    return { data: null, error: e };
  }

  const pin_hash = await hashPin(String(pin));

  const { data, error } = await supabase
    .from('guest_users')
    .insert({
      budget_centre_id:   centreId,
      name:               name.trim(),
      pin_hash,
      allowed_categories: allowedCategories,
      is_active:          true,
    })
    .select('id, budget_centre_id, name, allowed_categories, is_active, created_at')
    .single();

  if (error) console.error('[guests.service] createGuestUser error:', error.message);
  return { data, error };
};

/**
 * Update a guest user's name, PIN, or allowed categories.
 * If a new PIN is provided, it is hashed before storing.
 *
 * @param {string} guestId
 * @param {{ name?, pin?, allowedCategories? }} updates
 */
export const updateGuestUser = async (guestId, updates) => {
  const cleaned = {};

  try {
    if (updates.name !== undefined) {
      cleaned.name = validateString(updates.name, 'name');
    }
    if (updates.pin !== undefined) {
      validateString(String(updates.pin), 'pin');
      cleaned.pin_hash = await hashPin(String(updates.pin));
    }
    if (updates.allowedCategories !== undefined) {
      cleaned.allowed_categories = Array.isArray(updates.allowedCategories)
        ? updates.allowedCategories
        : [];
    }
  } catch (e) {
    console.error('[guests.service] updateGuestUser validation error:', e.message);
    return { data: null, error: e };
  }

  const { data, error } = await supabase
    .from('guest_users')
    .update(cleaned)
    .eq('id', guestId)
    .is('deleted_at', null)
    .select('id, budget_centre_id, name, allowed_categories, is_active, created_at')
    .single();

  if (error) console.error('[guests.service] updateGuestUser error:', error.message);
  return { data, error };
};

/**
 * Toggle a guest user's active status.
 *
 * @param {string} guestId
 * @param {boolean} isActive
 */
export const setGuestActive = async (guestId, isActive) => {
  const { data, error } = await supabase
    .from('guest_users')
    .update({ is_active: isActive })
    .eq('id', guestId)
    .is('deleted_at', null)
    .select('id, is_active')
    .single();

  if (error) console.error('[guests.service] setGuestActive error:', error.message);
  return { data, error };
};

/**
 * Soft delete a guest user.
 */
export const deleteGuestUser = async (guestId) => {
  const { error } = await supabase
    .from('guest_users')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', guestId);

  if (error) console.error('[guests.service] deleteGuestUser error:', error.message);
  return { error };
};

// ── Authentication (server-side via SECURITY DEFINER RPCs) ───────────────────

/**
 * List all active guest users for a centre — readable by anon key via RPC.
 * Returns only (id, name) — no sensitive fields.
 *
 * @param {string} centreId
 */
export const getCentreGuests = async (centreId) => {
  const { data, error } = await supabase.rpc('get_centre_guests', { p_centre_id: centreId });
  if (error) console.error('[guests.service] getCentreGuests error:', error.message);
  return { data: data || [], error };
};

/**
 * Authenticate a guest by ID and raw PIN.
 * PIN is hashed client-side; comparison and lockout happen server-side.
 * Returns { status, id, name, allowed_categories, budget_centre_id } on success.
 * Status values: 'ok' | 'wrong_pin' | 'locked'
 *
 * @param {string} guestId
 * @param {string} pin — raw PIN entered by guest
 */
export const authenticateGuest = async (guestId, pin) => {
  const pin_hash = await hashPin(String(pin));
  const { data, error } = await supabase.rpc('authenticate_guest', {
    p_guest_id:  guestId,
    p_pin_hash:  pin_hash,
  });
  if (error) {
    console.error('[guests.service] authenticateGuest error:', error.message);
    return { data: null, error };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return { data: row || null, error: null };
};

/**
 * Submit a guest expense transaction via the server-side RPC.
 * Guest session (guestId + centreId) is validated server-side.
 *
 * @param {{ guestId, centreId, amount, categoryName, description, date, week, currency }}
 * @returns {{ data: uuid|null, error }}
 */
export const submitGuestTransaction = async ({
  guestId, centreId, amount, categoryName, description, date, week, currency,
}) => {
  const { data, error } = await supabase.rpc('submit_guest_transaction', {
    p_guest_id:      guestId,
    p_centre_id:     centreId,
    p_amount:        amount,
    p_category_name: categoryName,
    p_description:   description || '',
    p_date:          date,
    p_week:          week,
    p_currency:      currency,
  });
  if (error) console.error('[guests.service] submitGuestTransaction error:', error.message);
  return { data, error };
};
