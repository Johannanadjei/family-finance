/**
 * views/settings/ThemeSection.test.jsx
 * Written before ThemeSection.jsx — TDD.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act }                   from '@testing-library/react';
import { ThemeSection }                          from './ThemeSection';

const mockSaveThemeSkin = vi.fn();
const mockUpdateCentre  = vi.fn();
let   mockUserPlan      = 'free';

vi.mock('../../context/FinanceContext', () => ({
  useFinanceContext: () => ({
    prefs:         { themeSkin: 'family_warmth' },
    saveThemeSkin: mockSaveThemeSkin,
    userPlan:      mockUserPlan,
  }),
}));

vi.mock('../../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({ updateCentre: mockUpdateCentre }),
}));


describe('ThemeSection', () => {
  beforeEach(() => { mockSaveThemeSkin.mockClear(); mockUpdateCentre.mockClear(); mockUserPlan = 'free'; });

  it('renders free theme option', () => {
    render(<ThemeSection />);
    expect(screen.getByTestId('theme-family_warmth')).toBeTruthy();
  });

  it('renders pro theme options', () => {
    render(<ThemeSection />);
    expect(screen.getByTestId('theme-global_international')).toBeTruthy();
    expect(screen.getByTestId('theme-corporate_professional')).toBeTruthy();
    expect(screen.getByTestId('theme-sunset_warm')).toBeTruthy();
    expect(screen.getByTestId('theme-neon_futuristic')).toBeTruthy();
    expect(screen.getByTestId('theme-dark_executive')).toBeTruthy();
    expect(screen.getByTestId('theme-minimal_light')).toBeTruthy();
    expect(screen.getByTestId('theme-royal_luxury')).toBeTruthy();
    expect(screen.getByTestId('theme-monochrome')).toBeTruthy();
  });

  it('disables pro themes for free users', () => {
    render(<ThemeSection />);
    expect(screen.getByTestId('theme-global_international').disabled).toBe(true);
    expect(screen.getByTestId('theme-neon_futuristic').disabled).toBe(true);
  });

  it('free theme is not disabled', () => {
    render(<ThemeSection />);
    expect(screen.getByTestId('theme-family_warmth').disabled).toBe(false);
  });

  it('calls saveThemeSkin when free theme selected', async () => {
    render(<ThemeSection />);
    await act(async () => { screen.getByTestId('theme-family_warmth').click(); });
    expect(mockSaveThemeSkin).toHaveBeenCalledWith('family_warmth');
  });

  it('calls updateCentre with skin_id when skin selected', async () => {
    render(<ThemeSection />);
    await act(async () => { screen.getByTestId('theme-family_warmth').click(); });
    expect(mockUpdateCentre).toHaveBeenCalledWith({ skin_id: 'family_warmth' });
  });

  it('does not call saveThemeSkin for pro themes on free plan', async () => {
    render(<ThemeSection />);
    await act(async () => { screen.getByTestId('theme-corporate_professional').click(); });
    expect(mockSaveThemeSkin).not.toHaveBeenCalled();
  });

  it('pro users can select pro skins', async () => {
    mockUserPlan = 'pro';
    render(<ThemeSection />);
    expect(screen.getByTestId('theme-corporate_professional').disabled).toBe(false);
    await act(async () => { screen.getByTestId('theme-corporate_professional').click(); });
    expect(mockSaveThemeSkin).toHaveBeenCalledWith('corporate_professional');
  });

  it('pro users see no PRO badge on pro skins', () => {
    mockUserPlan = 'pro';
    render(<ThemeSection />);
    expect(screen.queryByText('PRO')).toBeNull();
  });
});
