import { describe, it, expect } from 'vitest';
import { currencySymbol } from './currencies';

describe('currencySymbol', () => {
  it('maps known currency codes to symbols', () => {
    expect(currencySymbol('GHS')).toBe('₵');
    expect(currencySymbol('GBP')).toBe('£');
    expect(currencySymbol('USD')).toBe('$');
    expect(currencySymbol('EUR')).toBe('€');
    expect(currencySymbol('NGN')).toBe('₦');
    expect(currencySymbol('ZAR')).toBe('R');
    expect(currencySymbol('KES')).toBe('KSh');
  });

  it('returns the code itself for unknown currencies', () => {
    expect(currencySymbol('JPY')).toBe('JPY');
  });
});
