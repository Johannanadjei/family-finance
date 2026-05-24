/**
 * context/PinContext.jsx
 *
 * Exposes the single usePin instance from App.jsx to SecuritySection.
 * App.jsx calls usePin once and passes the result as the provider value.
 */

import { createContext, useContext } from 'react';

const PinContext = createContext(null);

export function PinProvider({ value, children }) {
  return <PinContext.Provider value={value}>{children}</PinContext.Provider>;
}

export function usePinContext() {
  const ctx = useContext(PinContext);
  if (!ctx) throw new Error('usePinContext must be used inside PinProvider');
  return ctx;
}
