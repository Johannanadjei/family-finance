import { persist, load, remove, KEYS } from '../lib/storage';

export const saveDraft  = (draft) => persist(KEYS.ONBOARDING_DRAFT, { ...draft, savedAt: new Date().toISOString() });
export const loadDraft  = () => load(KEYS.ONBOARDING_DRAFT);
export const hasDraft   = () => { const d = load(KEYS.ONBOARDING_DRAFT); return d !== null && d.step > 0; };
export const clearDraft = () => remove(KEYS.ONBOARDING_DRAFT);
