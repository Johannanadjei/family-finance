/**
 * services/pin.service.js
 *
 * All Supabase read/write for the users.pin_hash column.
 * The raw PIN never reaches this file — callers must hash first via lib/crypto.js.
 */

import { supabase } from '../lib/supabase';

/**
 * Fetch the stored PIN hash for a user.
 * @param {string} userId
 * @returns {Promise<{ data: string|null, error: object|null }>}
 */
export const getPinHash = async (userId) => {
  const { data, error } = await supabase
    .from('users')
    .select('pin_hash')
    .eq('id', userId)
    .maybeSingle();

  if (error) console.error('[pin.service] getPinHash error:', error.message);
  return { data: data?.pin_hash ?? null, error };
};

/**
 * Save a hashed PIN for a user.
 * @param {string} userId
 * @param {string} hash — SHA-256 hex string from hashPin()
 * @returns {Promise<{ error: object|null }>}
 */
export const savePinHash = async (userId, hash) => {
  const { data, error } = await supabase
    .from('users')
    .update({ pin_hash: hash })
    .eq('id', userId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[pin.service] savePinHash error:', error.message);
    return { error };
  }
  if (!data) {
    const err = new Error('PIN could not be saved — no matching user row');
    console.error('[pin.service] savePinHash: update matched 0 rows for userId:', userId);
    return { error: err };
  }
  return { error: null };
};

/**
 * Clear the PIN for a user (sets pin_hash to NULL).
 * @param {string} userId
 * @returns {Promise<{ error: object|null }>}
 */
export const clearPinHash = async (userId) => {
  const { error } = await supabase
    .from('users')
    .update({ pin_hash: null })
    .eq('id', userId);

  if (error) console.error('[pin.service] clearPinHash error:', error.message);
  return { error };
};
