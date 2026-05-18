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
import { hashPin, verifyPin } from '../lib/crypto';

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

// ── Authentication ────────────────────────────────────────────────────────────

/**
 * Authenticate a guest user by centre ID and PIN.
 * Returns the guest user data if PIN matches — never returns pin_hash.
 *
 * @param {string} centreId
 * @param {string} pin — raw PIN entered by guest
 */
export const authenticateGuest = async (centreId, pin) => {
  // Fetch all active guests for this centre including pin_hash for verification
  const { data: guests, error } = await supabase
    .from('guest_users')
    .select('*')
    .eq('budget_centre_id', centreId)
    .eq('is_active', true)
    .is('deleted_at', null);

  if (error) {
    console.error('[guests.service] authenticateGuest fetch error:', error.message);
    return { data: null, error };
  }

  // Verify PIN against each active guest
  for (const guest of guests) {
    const match = await verifyPin(String(pin), guest.pin_hash);
    if (match) {
      // Return guest without pin_hash
      const { pin_hash, ...safeGuest } = guest;
      return { data: safeGuest, error: null };
    }
  }

  return { data: null, error: new Error('Invalid PIN') };
};
