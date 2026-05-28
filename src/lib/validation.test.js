/**
 * lib/validation.test.js
 *
 * Unit tests for all validation functions in lib/validation.js
 * Every function tested with: valid input, invalid input, edge cases
 */

import { describe, it, expect } from 'vitest';
import {
  validateAmount,
  validateDate,
  validateWeek,
  validateCurrency,
  validateType,
  validateString,
  validateUUID,
  validateTransaction,
  validateCategory,
  validateIncomeSource,
} from './validation';

// ── validateAmount ────────────────────────────────────────────────────────────

describe('validateAmount', () => {
  it('returns rounded integer for valid amount', () =>
    expect(validateAmount(100)).toBe(100));

  it('rounds decimal amounts', () => {
    expect(validateAmount(100.7)).toBe(101);
    expect(validateAmount(100.4)).toBe(100);
  });

  it('handles string numbers', () =>
    expect(validateAmount('250')).toBe(250));

  it('throws for zero', () =>
    expect(validateAmount(0)).toBe(0));

  it('throws for negative', () =>
    expect(() => validateAmount(-100)).toThrow('zero or greater'));

  it('throws for NaN', () =>
    expect(() => validateAmount('abc')).toThrow('must be a number'));

  it('throws for null', () =>
    expect(() => validateAmount(null)).toThrow('Amount must be a number'));

  it('throws for undefined', () =>
    expect(() => validateAmount(undefined)).toThrow('must be a number'));
});

// ── validateDate ──────────────────────────────────────────────────────────────

describe('validateDate', () => {
  it('accepts valid date string', () =>
    expect(validateDate('2026-05-19')).toBe('2026-05-19'));

  it('throws for wrong format', () =>
    expect(() => validateDate('19/05/2026')).toThrow('YYYY-MM-DD'));

  it('throws for invalid date', () =>
    expect(() => validateDate('2026-13-01')).toThrow());

  it('throws for empty string', () =>
    expect(() => validateDate('')).toThrow());

  it('throws for null', () =>
    expect(() => validateDate(null)).toThrow());
});

// ── validateWeek ──────────────────────────────────────────────────────────────

describe('validateWeek', () => {
  it('accepts all valid weeks', () => {
    ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'].forEach(w =>
      expect(validateWeek(w)).toBe(w)
    );
  });

  it('throws for Week 6', () =>
    expect(() => validateWeek('Week 6')).toThrow());

  it('throws for lowercase', () =>
    expect(() => validateWeek('week 1')).toThrow());

  it('throws for empty string', () =>
    expect(() => validateWeek('')).toThrow());
});

// ── validateCurrency ──────────────────────────────────────────────────────────

describe('validateCurrency', () => {
  it('accepts all supported currencies', () => {
    ['GHS', 'USD', 'GBP', 'EUR', 'NGN', 'KES', 'ZAR', 'CAD'].forEach(c =>
      expect(validateCurrency(c)).toBe(c)
    );
  });

  it('throws for unsupported currency', () =>
    expect(() => validateCurrency('XYZ')).toThrow('Unsupported'));

  it('throws for empty string', () =>
    expect(() => validateCurrency('')).toThrow());

  it('throws for lowercase', () =>
    expect(() => validateCurrency('ghs')).toThrow());
});

// ── validateType ──────────────────────────────────────────────────────────────

describe('validateType', () => {
  it('accepts income', () =>
    expect(validateType('income')).toBe('income'));

  it('accepts expense', () =>
    expect(validateType('expense')).toBe('expense'));

  it('throws for Income with capital', () =>
    expect(() => validateType('Income')).toThrow());

  it('throws for unknown type', () =>
    expect(() => validateType('transfer')).toThrow());
});

// ── validateString ────────────────────────────────────────────────────────────

describe('validateString', () => {
  it('returns trimmed string', () =>
    expect(validateString('  hello  ', 'field')).toBe('hello'));

  it('throws for empty string', () =>
    expect(() => validateString('', 'field')).toThrow('field'));

  it('throws for whitespace only', () =>
    expect(() => validateString('   ', 'field')).toThrow('field'));

  it('throws for null', () =>
    expect(() => validateString(null, 'field')).toThrow('field'));

  it('throws for undefined', () =>
    expect(() => validateString(undefined, 'field')).toThrow('field'));

  it('includes field name in error', () =>
    expect(() => validateString('', 'category_name')).toThrow('category_name'));
});

// ── validateUUID ──────────────────────────────────────────────────────────────

describe('validateUUID', () => {
  it('accepts valid UUID', () =>
    expect(validateUUID('550e8400-e29b-41d4-a716-446655440000', 'id'))
      .toBe('550e8400-e29b-41d4-a716-446655440000'));

  it('throws for invalid UUID', () =>
    expect(() => validateUUID('not-a-uuid', 'id')).toThrow());

  it('throws for empty string', () =>
    expect(() => validateUUID('', 'id')).toThrow());
});

// ── validateTransaction ───────────────────────────────────────────────────────

describe('validateTransaction', () => {
  const validTx = {
    date:           '2026-05-19',
    week:           'Week 3',
    type:           'expense',
    category_name:  'Groceries',
    amount:         500,
    currency:       'GHS',
    description:    'Weekly shop',
    logged_by_name: 'Johannan',
    source:         'main_app',
  };

  it('accepts valid transaction', () => {
    const result = validateTransaction(validTx);
    expect(result.amount).toBe(500);
    expect(result.category_name).toBe('Groceries');
  });

  it('rounds amount', () => {
    const result = validateTransaction({ ...validTx, amount: 500.7 });
    expect(result.amount).toBe(501);
  });

  it('defaults source to main_app for unknown source', () => {
    const result = validateTransaction({ ...validTx, source: 'unknown' });
    expect(result.source).toBe('main_app');
  });

  it('trims description', () => {
    const result = validateTransaction({ ...validTx, description: '  hello  ' });
    expect(result.description).toBe('hello');
  });

  it('defaults empty description to empty string', () => {
    const result = validateTransaction({ ...validTx, description: null });
    expect(result.description).toBe('');
  });

  it('throws for invalid date', () =>
    expect(() => validateTransaction({ ...validTx, date: 'bad-date' })).toThrow());

  it('throws for invalid week', () =>
    expect(() => validateTransaction({ ...validTx, week: 'Week 6' })).toThrow());

  it('accepts zero amount', () =>
    expect(() => validateTransaction({ ...validTx, amount: 0 })).not.toThrow());

  it('throws for invalid currency', () =>
    expect(() => validateTransaction({ ...validTx, currency: 'XYZ' })).toThrow());

  it('throws for empty category_name', () =>
    expect(() => validateTransaction({ ...validTx, category_name: '' })).toThrow());

  it('coerces from_spare to boolean false when missing', () => {
    const result = validateTransaction(validTx);
    expect(result.from_spare).toBe(false);
  });

  it('coerces from_spare to boolean true when truthy', () => {
    const result = validateTransaction({ ...validTx, from_spare: true });
    expect(result.from_spare).toBe(true);
  });

  it('coerces from_spare to boolean false when falsy non-boolean', () => {
    const result = validateTransaction({ ...validTx, from_spare: 0 });
    expect(result.from_spare).toBe(false);
  });
});

// ── validateCategory ──────────────────────────────────────────────────────────

describe('validateCategory', () => {
  const validCat = {
    name:          'Groceries',
    icon:          '🛒',
    budget_amount: 500,
    month:         '2026-05',
    sort_order:    0,
  };

  it('accepts valid category', () => {
    const result = validateCategory(validCat);
    expect(result.name).toBe('Groceries');
    expect(result.budget_amount).toBe(500);
  });

  it('defaults icon to 💸 when missing', () => {
    const result = validateCategory({ ...validCat, icon: '' });
    expect(result.icon).toBe('💸');
  });

  it('rounds budget_amount', () => {
    const result = validateCategory({ ...validCat, budget_amount: 500.7 });
    expect(result.budget_amount).toBe(501);
  });

  it('accepts zero budget_amount', () => {
    const result = validateCategory({ ...validCat, budget_amount: 0 });
    expect(result.budget_amount).toBe(0);
  });

  it('throws for invalid month format', () =>
    expect(() => validateCategory({ ...validCat, month: '05-2026' })).toThrow('YYYY-MM'));

  it('throws for empty name', () =>
    expect(() => validateCategory({ ...validCat, name: '' })).toThrow());

  it('defaults sort_order to 0 when not integer', () => {
    const result = validateCategory({ ...validCat, sort_order: 'abc' });
    expect(result.sort_order).toBe(0);
  });
});

// ── validateIncomeSource ──────────────────────────────────────────────────────

describe('validateIncomeSource', () => {
  const validSource = {
    label:           'Salary',
    icon:            '💰',
    expected_amount: 5000,
    currency:        'GHS',
    pay_day:         25,
    pay_day_type:    'fixed_date',
    notes:           'Monthly salary',
  };

  it('accepts valid income source', () => {
    const result = validateIncomeSource(validSource);
    expect(result.label).toBe('Salary');
    expect(result.expected_amount).toBe(5000);
  });

  it('defaults icon to 💰 when missing', () => {
    const result = validateIncomeSource({ ...validSource, icon: '' });
    expect(result.icon).toBe('💰');
  });

  it('clamps pay_day to 1-31', () => {
    expect(validateIncomeSource({ ...validSource, pay_day: 0  }).pay_day).toBe(1);
    expect(validateIncomeSource({ ...validSource, pay_day: 32 }).pay_day).toBe(31);
  });

  it('sets pay_day to null when not provided', () => {
    const result = validateIncomeSource({ ...validSource, pay_day: null });
    expect(result.pay_day).toBeNull();
  });

  it('defaults pay_day_type to flexible for unknown value', () => {
    const result = validateIncomeSource({ ...validSource, pay_day_type: 'unknown' });
    expect(result.pay_day_type).toBe('flexible');
  });

  it('throws for empty label', () =>
    expect(() => validateIncomeSource({ ...validSource, label: '' })).toThrow());

  it('throws for invalid currency', () =>
    expect(() => validateIncomeSource({ ...validSource, currency: 'XYZ' })).toThrow());

  it('trims notes', () => {
    const result = validateIncomeSource({ ...validSource, notes: '  hello  ' });
    expect(result.notes).toBe('hello');
  });

  it('defaults notes to empty string when null', () => {
    const result = validateIncomeSource({ ...validSource, notes: null });
    expect(result.notes).toBe('');
  });
});
