import { describe, it, expect } from 'vitest';
import { can, ROLES, ROLE_LABELS, INVITABLE_ROLES } from './roles';

describe('can()', () => {
  describe('owner', () => {
    it('can log',           () => expect(can('owner', 'log')).toBe(true));
    it('can logIncome',     () => expect(can('owner', 'logIncome')).toBe(true));
    it('can viewIncome',    () => expect(can('owner', 'viewIncome')).toBe(true));
    it('can settings',      () => expect(can('owner', 'settings')).toBe(true));
    it('can manageMembers', () => expect(can('owner', 'manageMembers')).toBe(true));
  });

  describe('full_access', () => {
    it('can log',              () => expect(can('full_access', 'log')).toBe(true));
    it('can logIncome',        () => expect(can('full_access', 'logIncome')).toBe(true));
    it('can viewIncome',       () => expect(can('full_access', 'viewIncome')).toBe(true));
    it('can settings',         () => expect(can('full_access', 'settings')).toBe(true));
    it('cannot manageMembers', () => expect(can('full_access', 'manageMembers')).toBe(false));
  });

  describe('standard', () => {
    it('can log',             () => expect(can('standard', 'log')).toBe(true));
    it('cannot logIncome',    () => expect(can('standard', 'logIncome')).toBe(false));
    it('cannot viewIncome',   () => expect(can('standard', 'viewIncome')).toBe(false));
    it('cannot settings',     () => expect(can('standard', 'settings')).toBe(false));
    it('cannot manageMembers',() => expect(can('standard', 'manageMembers')).toBe(false));
  });

  describe('viewBalance', () => {
    it('owner can viewBalance',      () => expect(can('owner', 'viewBalance')).toBe(true));
    it('full_access can viewBalance',() => expect(can('full_access', 'viewBalance')).toBe(true));
    it('standard cannot viewBalance',() => expect(can('standard', 'viewBalance')).toBe(false));
  });

  describe('manageCycles', () => {
    it('owner can manageCycles',       () => expect(can('owner', 'manageCycles')).toBe(true));
    it('full_access can manageCycles', () => expect(can('full_access', 'manageCycles')).toBe(true));
    it('standard cannot manageCycles', () => expect(can('standard', 'manageCycles')).toBe(false));
  });

  describe('unknown / edge cases', () => {
    it('returns false for unknown role',      () => expect(can('hacker', 'log')).toBe(false));
    it('returns false for unknown permission',() => expect(can('owner', 'deleteEverything')).toBe(false));
    it('returns false for null role',         () => expect(can(null, 'log')).toBe(false));
    it('returns false for undefined role',    () => expect(can(undefined, 'log')).toBe(false));
  });
});

describe('ROLES constants', () => {
  it('exports all three roles', () => {
    expect(ROLES.OWNER).toBe('owner');
    expect(ROLES.FULL_ACCESS).toBe('full_access');
    expect(ROLES.STANDARD).toBe('standard');
  });
});

describe('ROLE_LABELS', () => {
  it('has a label for every role', () => {
    ['owner', 'full_access', 'standard'].forEach(r =>
      expect(typeof ROLE_LABELS[r]).toBe('string')
    );
  });
});

describe('INVITABLE_ROLES', () => {
  it('does not include owner',   () => expect(INVITABLE_ROLES).not.toContain('owner'));
  it('includes full_access',     () => expect(INVITABLE_ROLES).toContain('full_access'));
  it('includes standard',        () => expect(INVITABLE_ROLES).toContain('standard'));
  it('does not include view_only', () => expect(INVITABLE_ROLES).not.toContain('view_only'));
});
