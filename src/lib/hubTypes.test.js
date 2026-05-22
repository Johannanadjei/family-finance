/**
 * lib/hubTypes.test.js
 */

import { describe, it, expect } from 'vitest';
import { HUB_TYPES, getHubType, getDefaultCategories } from './hubTypes';

describe('HUB_TYPES', () => {
  it('contains at least four hub types', () => {
    expect(HUB_TYPES.length).toBeGreaterThanOrEqual(4);
  });

  it('each hub has id, label, icon, defaultSkin, description', () => {
    HUB_TYPES.forEach(h => {
      expect(typeof h.id).toBe('string');
      expect(typeof h.label).toBe('string');
      expect(typeof h.icon).toBe('string');
      expect(typeof h.defaultSkin).toBe('string');
      expect(typeof h.description).toBe('string');
    });
  });

  it('includes family_home, rental, business, personal', () => {
    const ids = HUB_TYPES.map(h => h.id);
    expect(ids).toContain('family_home');
    expect(ids).toContain('rental');
    expect(ids).toContain('business');
    expect(ids).toContain('personal');
  });
});

describe('getHubType', () => {
  it('returns the correct hub for a valid id', () => {
    const hub = getHubType('family_home');
    expect(hub.label).toBe('Family Home');
    expect(hub.icon).toBe('🏠');
  });

  it('returns undefined for an unknown id', () => {
    expect(getHubType('does_not_exist')).toBeUndefined();
  });
});

describe('getDefaultCategories', () => {
  const requiredKeys = ['name', 'icon', 'budget_amount', 'is_fixed', 'sort_order'];

  it.each(['family_home', 'rental', 'business', 'personal'])(
    '%s returns a non-empty array of valid categories',
    (type) => {
      const cats = getDefaultCategories(type);
      expect(Array.isArray(cats)).toBe(true);
      expect(cats.length).toBeGreaterThan(0);
      cats.forEach(c => requiredKeys.forEach(k => expect(c).toHaveProperty(k)));
    }
  );

  it('sort_order is sequential from 0', () => {
    ['family_home', 'rental', 'business', 'personal'].forEach(type => {
      const cats = getDefaultCategories(type);
      cats.forEach((c, i) => expect(c.sort_order).toBe(i));
    });
  });

  it('returns family_home categories for an unknown type', () => {
    const fallback = getDefaultCategories('unknown_type');
    const family   = getDefaultCategories('family_home');
    expect(fallback.map(c => c.name)).toEqual(family.map(c => c.name));
  });

  it('returns a fresh copy — mutations do not affect the source', () => {
    const a = getDefaultCategories('family_home');
    const b = getDefaultCategories('family_home');
    a[0].budget_amount = 9999;
    expect(b[0].budget_amount).toBe(0);
  });

  it('rental preset includes cleaning and platform-fee categories', () => {
    const cats  = getDefaultCategories('rental');
    const names = cats.map(c => c.name);
    expect(names.some(n => n.toLowerCase().includes('clean'))).toBe(true);
    expect(names.some(n => n.toLowerCase().includes('platform'))).toBe(true);
  });

  it('business preset includes staff and inventory categories', () => {
    const cats  = getDefaultCategories('business');
    const names = cats.map(c => c.name);
    expect(names.some(n => n.toLowerCase().includes('staff') || n.toLowerCase().includes('wage'))).toBe(true);
    expect(names.some(n => n.toLowerCase().includes('inventor'))).toBe(true);
  });

  it('personal preset includes savings category', () => {
    const cats  = getDefaultCategories('personal');
    const names = cats.map(c => c.name);
    expect(names.some(n => n.toLowerCase().includes('saving'))).toBe(true);
  });

  it('budget_amount defaults to 0 for all presets', () => {
    ['family_home', 'rental', 'business', 'personal'].forEach(type => {
      getDefaultCategories(type).forEach(c => expect(c.budget_amount).toBe(0));
    });
  });
});
