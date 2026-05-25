/**
 * lib/roles.js
 *
 * Role constants and permission map for member RBAC.
 * Single source of truth — import ROLES and can() everywhere.
 *
 * Roles:
 *   owner       — hub creator, full control including hub management
 *   full_access — co-owner, same as owner except cannot delete the hub
 *   standard    — expense logging only, no income visibility
 *   view_only   — read-only budget health, no logging
 */

export const ROLES = {
  OWNER:       'owner',
  FULL_ACCESS: 'full_access',
  STANDARD:    'standard',
  VIEW_ONLY:   'view_only',
};

// Permission map — all keys are false unless explicitly true
const PERMISSIONS = {
  owner:       { log: true,  logIncome: true,  viewIncome: true,  settings: true,  manageMembers: true  },
  full_access: { log: true,  logIncome: true,  viewIncome: true,  settings: true,  manageMembers: false },
  standard:    { log: true,  logIncome: false, viewIncome: false, settings: false, manageMembers: false },
  view_only:   { log: false, logIncome: false, viewIncome: false, settings: false, manageMembers: false },
};

/**
 * Check whether a role has a given permission.
 * Returns false for any unknown role or permission — safe default.
 *
 * @param {string} role
 * @param {string} permission — 'log' | 'logIncome' | 'viewIncome' | 'settings' | 'manageMembers'
 * @returns {boolean}
 */
export const can = (role, permission) =>
  PERMISSIONS[role]?.[permission] ?? false;

export const ROLE_LABELS = {
  owner:       'Owner',
  full_access: 'Full Access',
  standard:    'Standard',
  view_only:   'View Only',
};

export const ROLE_DESCRIPTIONS = {
  owner:       'Full control — can manage hub, members, and all finances',
  full_access: 'Can log expenses and income, manage settings and categories',
  standard:    'Can log expenses only — cannot see income or salary amounts',
  view_only:   'Read-only — can see budget health and categories only',
};

export const INVITABLE_ROLES = ['full_access', 'standard', 'view_only'];
