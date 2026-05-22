/**
 * views/settings/ThemeSection.test.jsx
 * Written before ThemeSection.jsx — TDD.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act }                   from '@testing-library/react';
import { ThemeSection }                          from './ThemeSection';

const mockSaveThemeSkin = vi.fn();

vi.mock('../../context/FinanceContext', () => ({
  useFinanceContext: () => ({
    prefs:         { themeSkin: 'family_warmth' },
    saveThemeSkin: mockSaveThemeSkin,
  }),
}));

vi.mock('../../lib/themes', () => ({
  applyTheme: vi.fn(),
}));

describe('ThemeSection', () => {
  beforeEach(() => { mockSaveThemeSkin.mockClear(); });

  it('renders free theme option', () => {
    render(<ThemeSection />);
    expect(screen.getByTestId('theme-family_warmth')).toBeTruthy();
  });

  it('renders pro theme options', () => {
    render(<ThemeSection />);
    expect(screen.getByTestId('theme-midnight_pro')).toBeTruthy();
    expect(screen.getByTestId('theme-ocean_pro')).toBeTruthy();
  });

  it('disables pro themes', () => {
    render(<ThemeSection />);
    expect(screen.getByTestId('theme-midnight_pro').disabled).toBe(true);
    expect(screen.getByTestId('theme-gold_pro').disabled).toBe(true);
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

  it('does not call saveThemeSkin for pro themes', async () => {
    render(<ThemeSection />);
    await act(async () => { screen.getByTestId('theme-midnight_pro').click(); });
    expect(mockSaveThemeSkin).not.toHaveBeenCalled();
  });
});
