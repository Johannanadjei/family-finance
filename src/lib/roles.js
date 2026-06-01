/**
 * lib/roles.js
 *
 * Role constants and permission map for member RBAC.
 * Single source of truth — import ROLES and can() everywhere.
 *
 * Roles:
 *   owner       — hub creator, full control including hub management
 *   full_access — co-owner, same as owner except cannot manage members
 *   standard    — expense logging only, no income or balance visibility
 */

export const ROLES = {
  OWNER:       'owner',
  FULL_ACCESS: 'full_access',
  STANDARD:    'standard',
};

// Permission map — all keys are false unless explicitly true
const PERMISSIONS = {
  owner:       { log: true,  logIncome: true,  viewIncome: true,  settings: true,  manageMembers: true,  viewAllTxs: true,  viewBalance: true,  manageCycles: true  },
  full_access: { log: true,  logIncome: true,  viewIncome: true,  settings: true,  manageMembers: false, viewAllTxs: true,  viewBalance: true,  manageCycles: true  },
  standard:    { log: true,  logIncome: false, viewIncome: false, settings: false, manageMembers: false, viewAllTxs: false, viewBalance: false, manageCycles: false },
};

/**
 * Check whether a role has a given permission.
 * Returns false for any unknown role or permission — safe default.
 *
 * @param {string} role
 * @param {string} permission — 'log' | 'logIncome' | 'viewIncome' | 'settings' | 'manageMembers' | 'viewAllTxs' | 'viewBalance' | 'manageCycles'
 * @returns {boolean}
 */
export const can = (role, permission) =>
  PERMISSIONS[role]?.[permission] ?? false;

export const ROLE_LABELS = {
  owner:       'Owner',
  full_access: 'Full Access',
  standard:    'Standard',
};

export const ROLE_DESCRIPTIONS = {
  owner:       'Full control — can manage hub, members, and all finances',
  full_access: 'Can log expenses and income, manage settings and categories',
  standard:    'Can log expenses only — cannot see income or balance amounts',
};

export const INVITABLE_ROLES = ['full_access', 'standard'];

/** Maximum member count (active + pending invites) per plan tier. */
export const MAX_MEMBERS = { free: 2, pro: 6 };
