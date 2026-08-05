/**
 * views/settings/ThemeSection.test.jsx
 * Written before ThemeSection.jsx — TDD.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, within }           from '@testing-library/react';
import { ThemeSection }                          from './ThemeSection';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));

const mockSaveThemeSkin    = vi.fn();
const mockUpdateCentreSkin = vi.fn().mockResolvedValue({ data: {}, error: null });
let   mockHubPlan         = 'free';
let   mockCan              = () => true;
let   mockIsOwner          = true;

vi.mock('../../context/FinanceContext', () => ({
  useFinanceContext: () => ({
    prefs:         { themeSkin: 'family_warmth' },
    saveThemeSkin: mockSaveThemeSkin,
    hubPlan:       mockHubPlan,
  }),
}));

vi.mock('../../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({ updateCentreSkin: mockUpdateCentreSkin, can: (p) => mockCan(p), isOwner: mockIsOwner }),
}));


describe('ThemeSection', () => {
  beforeEach(() => { mockSaveThemeSkin.mockClear(); mockUpdateCentreSkin.mockClear(); mockNavigate.mockClear(); mockUpdateCentreSkin.mockResolvedValue({ data: {}, error: null }); mockHubPlan = 'free'; mockCan = () => true; mockIsOwner = true; });

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

  it('skin-cap modal CTA routes to /pricing', async () => {
    render(<ThemeSection />);
    await act(async () => { screen.getByTestId('theme-global_international').click(); });
    const cta = within(screen.getByRole('dialog')).getByText('Upgrade to Pro');
    await act(async () => { cta.click(); });
    expect(mockNavigate).toHaveBeenCalledWith('/pricing');
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
    mockHubPlan = 'pro';
    render(<ThemeSection />);
    expect(screen.getByTestId('theme-corporate_professional').disabled).toBe(false);
    await act(async () => { screen.getByTestId('theme-corporate_professional').click(); });
    expect(mockSaveThemeSkin).toHaveBeenCalledWith('corporate_professional');
  });

  it('pro users see no PRO badge on pro skins', () => {
    mockHubPlan = 'pro';
    render(<ThemeSection />);
    expect(screen.queryByText('PRO')).toBeNull();
  });

  // A full_access member of a PAID hub may legitimately set a Pro skin —
  // update_centre_skin authorises owner OR full_access and gates on the OWNER's tier.
  // Locking their chips off the viewer's own tier was the false-cap bug.
  it('PRO hub: skins unlock for a non-owner member too', async () => {
    mockHubPlan = 'pro';
    mockIsOwner = false;
    render(<ThemeSection />);
    expect(screen.queryByText('PRO')).toBeNull();
    await act(async () => { screen.getByTestId('theme-corporate_professional').click(); });
    expect(mockSaveThemeSkin).toHaveBeenCalledWith('corporate_professional');
  });

  it('hubPlan unresolved: no PRO badge flashes before the tier lands', () => {
    mockHubPlan = null;
    render(<ThemeSection />);
    expect(screen.queryByText('PRO')).toBeNull();
  });

  it('free hub, non-owner: the skin modal explains the cap but offers no pay CTA', async () => {
    mockIsOwner = false;
    render(<ThemeSection />);
    await act(async () => { screen.getByTestId('theme-corporate_professional').click(); });

    expect(screen.getByText(/skin limit/)).toBeTruthy();       // cap message intact
    expect(screen.getByTestId('ask-owner-note')).toBeTruthy();
    expect(screen.queryByText('Upgrade to Pro')).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('renders nothing for standard members (no settings permission)', () => {
    mockCan = () => false;
    const { container } = render(<ThemeSection />);
    expect(container.firstChild).toBeNull();
  });
});
