/**
 * features/onboarding/onboarding.validation.test.js
 *
 * Unit tests for onboarding validation functions.
 * Written before the components that use them.
 */

import { describe, it, expect } from 'vitest';
import {
  validateCentreStep,
  validateIncomeStep,
  validateCategoriesStep,
  validateTargetStep,
} from './onboarding.validation';

// ── validateCentreStep ────────────────────────────────────────────────────────

describe('validateCentreStep', () => {
  it('returns null for valid data', () =>
    expect(validateCentreStep({ name: 'The Adjeis', currency: 'GHS' })).toBeNull());

  it('returns error for empty name', () =>
    expect(validateCentreStep({ name: '', currency: 'GHS' })).toBeTruthy());

  it('returns error for whitespace name', () =>
    expect(validateCentreStep({ name: '   ', currency: 'GHS' })).toBeTruthy());

  it('returns error for name over 50 chars', () =>
    expect(validateCentreStep({ name: 'a'.repeat(51), currency: 'GHS' })).toBeTruthy());

  it('accepts name of exactly 50 chars', () =>
    expect(validateCentreStep({ name: 'a'.repeat(50), currency: 'GHS' })).toBeNull());

  it('returns error for invalid currency', () =>
    expect(validateCentreStep({ name: 'Test', currency: 'XYZ' })).toBeTruthy());

  it('returns error for missing currency', () =>
    expect(validateCentreStep({ name: 'Test', currency: '' })).toBeTruthy());

  it('accepts all supported currencies', () => {
    ['GHS', 'USD', 'GBP', 'EUR', 'NGN', 'KES', 'ZAR', 'CAD'].forEach(c =>
      expect(validateCentreStep({ name: 'Test', currency: c })).toBeNull()
    );
  });
});

// ── validateIncomeStep ────────────────────────────────────────────────────────

const validIncome = {
  id:              'inc-1',
  label:           'Salary',
  icon:            '💰',
  expected_amount: 5000,
  currency:        'GHS',
  pay_day:         25,
  pay_day_type:    'fixed_date',
  notes:           '',
};

describe('validateIncomeStep', () => {
  it('returns null for valid incomes', () =>
    expect(validateIncomeStep([validIncome])).toBeNull());

  it('returns error for empty array', () =>
    expect(validateIncomeStep([])).toBeTruthy());

  it('returns error for empty label', () =>
    expect(validateIncomeStep([{ ...validIncome, label: '' }])).toBeTruthy());

  it('returns error for zero amount', () =>
    expect(validateIncomeStep([{ ...validIncome, expected_amount: 0 }])).toBeTruthy());

  it('returns error for negative amount', () =>
    expect(validateIncomeStep([{ ...validIncome, expected_amount: -100 }])).toBeTruthy());

  it('returns error for fixed_date with no pay_day', () =>
    expect(validateIncomeStep([{ ...validIncome, pay_day_type: 'fixed_date', pay_day: null }])).toBeTruthy());

  it('returns error for fixed_date with pay_day 0', () =>
    expect(validateIncomeStep([{ ...validIncome, pay_day_type: 'fixed_date', pay_day: 0 }])).toBeTruthy());

  it('returns error for fixed_date with pay_day 32', () =>
    expect(validateIncomeStep([{ ...validIncome, pay_day_type: 'fixed_date', pay_day: 32 }])).toBeTruthy());

  it('accepts fixed_date with pay_day 1', () =>
    expect(validateIncomeStep([{ ...validIncome, pay_day_type: 'fixed_date', pay_day: 1 }])).toBeNull());

  it('accepts fixed_date with pay_day 31', () =>
    expect(validateIncomeStep([{ ...validIncome, pay_day_type: 'fixed_date', pay_day: 31 }])).toBeNull());

  it('accepts flexible with no pay_day', () =>
    expect(validateIncomeStep([{ ...validIncome, pay_day_type: 'flexible', pay_day: null }])).toBeNull());

  it('validates all incomes in array', () =>
    expect(validateIncomeStep([validIncome, { ...validIncome, label: '' }])).toBeTruthy());

  it('accepts multiple valid incomes', () =>
    expect(validateIncomeStep([validIncome, { ...validIncome, id: 'inc-2', label: 'Bonus' }])).toBeNull());
});

// ── validateCategoriesStep ────────────────────────────────────────────────────

const validCategory = {
  id:            'cat-1',
  name:          'Groceries',
  icon:          '🛒',
  budget_amount: 500,
  is_fixed:      true,
  sort_order:    0,
};

describe('validateCategoriesStep', () => {
  it('returns null for valid categories', () =>
    expect(validateCategoriesStep([validCategory])).toBeNull());

  it('returns error for empty array', () =>
    expect(validateCategoriesStep([])).toBeTruthy());

  it('returns error for empty name', () =>
    expect(validateCategoriesStep([{ ...validCategory, name: '' }])).toBeTruthy());

  it('returns error for negative budget', () =>
    expect(validateCategoriesStep([{ ...validCategory, budget_amount: -1 }])).toBeTruthy());

  it('accepts zero budget amount', () =>
    expect(validateCategoriesStep([{ ...validCategory, budget_amount: 0 }])).toBeNull());

  it('validates all categories in array', () =>
    expect(validateCategoriesStep([validCategory, { ...validCategory, name: '' }])).toBeTruthy());

  it('accepts multiple valid categories', () =>
    expect(validateCategoriesStep([
      validCategory,
      { ...validCategory, id: 'cat-2', name: 'Transport' },
    ])).toBeNull());
});

// ── validateTargetStep ────────────────────────────────────────────────────────

describe('validateTargetStep', () => {
  it('returns null for zero', () =>
    expect(validateTargetStep(0)).toBeNull());

  it('returns null for positive number', () =>
    expect(validateTargetStep(1000)).toBeNull());

  it('returns null for string number', () =>
    expect(validateTargetStep('1000')).toBeNull());

  it('returns error for negative', () =>
    expect(validateTargetStep(-1)).toBeTruthy());

  it('returns error for NaN string', () =>
    expect(validateTargetStep('abc')).toBeTruthy());

  it('returns null for decimal', () =>
    expect(validateTargetStep(999.99)).toBeNull());
});
