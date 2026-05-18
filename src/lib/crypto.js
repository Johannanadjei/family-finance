/**
 * lib/crypto.js
 *
 * PIN hashing for guest users.
 * Uses the Web Crypto API — available in all modern browsers.
 * The raw PIN never leaves the client after hashPin() runs.
 * Never store or log the raw PIN anywhere.
 */

/**
 * Hash a PIN string using SHA-256.
 * @param {string} pin — raw PIN entered by user
 * @returns {Promise<string>} — hex string of the hash
 */
export const hashPin = async (pin) => {
  const encoder = new TextEncoder();
  const data     = encoder.encode(String(pin).trim());
  const hashBuf  = await crypto.subtle.digest('SHA-256', data);
  const hashArr  = Array.from(new Uint8Array(hashBuf));
  return hashArr.map(b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Verify a PIN against a stored hash.
 * @param {string} pin — raw PIN entered by user
 * @param {string} storedHash — SHA-256 hex hash from Supabase
 * @returns {Promise<boolean>}
 */
export const verifyPin = async (pin, storedHash) => {
  const hash = await hashPin(pin);
  return hash === storedHash;
};
