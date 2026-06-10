/**
 * views/settings/ThemeSection.test.jsx
 * Written before ThemeSection.jsx — TDD.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act }                   from '@testing-library/react';
import { ThemeSection }                          from './ThemeSection';

const mockSaveThemeSkin    = vi.fn();
const mockUpdateCentreSkin = vi.fn().mockResolvedValue({ data: {}, error: null });
let   mockUserPlan         = 'free';
let   mockCan              = () => true;

vi.mock('../../context/FinanceContext', () => ({
  useFinanceContext: () => ({
    prefs:         { themeSkin: 'family_warmth' },
    saveThemeSkin: mockSaveThemeSkin,
    userPlan:      mockUserPlan,
  }),
}));

vi.mock('../../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({ updateCentreSkin: mockUpdateCentreSkin, can: (p) => mockCan(p) }),
}));


describe('ThemeSection', () => {
  beforeEach(() => { mockSaveThemeSkin.mockClear(); mockUpdateCentreSkin.mockClear(); mockUpdateCentreSkin.mockResolvedValue({ data: {}, error: null }); mockUserPlan = 'free'; mockCan = () => true; });

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
    expect(screen.getByTestId('theme-panda')).toBeTruthy();
  });

  it('pro themes are tappable (not disabled) but locked for free users → open the upgrade modal', () => {
    render(<ThemeSection />);
    const chip = screen.getByTestId('theme-global_international');
    expect(chip.disabled).toBe(false);               // tappable, not disabled
    act(() => { chip.click(); });
    expect(screen.getByText(/skin limit/)).toBeTruthy();   // SKIN_CAP_BODY in the UpgradeModal
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

  it('calls updateCentreSkin when a skin is selected', async () => {
    render(<ThemeSection />);
    await act(async () => { screen.getByTestId('theme-family_warmth').click(); });
    expect(mockUpdateCentreSkin).toHaveBeenCalledWith('family_warmth');
  });

  it('does not call saveThemeSkin or updateCentreSkin for pro themes on free plan', async () => {
    render(<ThemeSection />);
    await act(async () => { screen.getByTestId('theme-corporate_professional').click(); });
    expect(mockSaveThemeSkin).not.toHaveBeenCalled();
    expect(mockUpdateCentreSkin).not.toHaveBeenCalled();
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

  it('renders nothing for standard members (no settings permission)', () => {
    mockCan = () => false;
    const { container } = render(<ThemeSection />);
    expect(container.firstChild).toBeNull();
  });
});
