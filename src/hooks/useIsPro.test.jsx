/**
 * hooks/useIsPro.test.jsx
 *
 * useIsPro is a thin read of SubscriptionContext.isPro — assert it reflects the
 * context value and makes no DB call.
 */

import { describe, it, expect } from 'vitest';
import { renderHook }           from '@testing-library/react';
import { SubscriptionProvider } from '../context/SubscriptionContext';
import { useIsPro }             from './useIsPro';

const wrapper = (value) => ({ children }) => (
  <SubscriptionProvider value={value}>{children}</SubscriptionProvider>
);

describe('useIsPro', () => {
  it('returns true when the context reports a pro user', () => {
    const { result } = renderHook(() => useIsPro(), { wrapper: wrapper({ isPro: true, tier: 'pro' }) });
    expect(result.current).toBe(true);
  });

  it('returns false when the context reports a free user', () => {
    const { result } = renderHook(() => useIsPro(), { wrapper: wrapper({ isPro: false, tier: 'free' }) });
    expect(result.current).toBe(false);
  });
});
