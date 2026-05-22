/**
 * views/settings/CentreSettingsSection.test.jsx
 * Written before CentreSettingsSection.jsx — TDD.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent }        from '@testing-library/react';
import { CentreSettingsSection }                 from './CentreSettingsSection';
import { mockCentre, mockFmt }                   from '../../test-utils/fixtures';

const mockUpdateCentre = vi.fn().mockResolvedValue({ error: null });

vi.mock('../../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({
    centre:       mockCentre,
    fmt:          mockFmt,
    updateCentre: mockUpdateCentre,
  }),
}));

describe('CentreSettingsSection', () => {
  beforeEach(() => { mockUpdateCentre.mockClear(); });

  it('renders centre name', () => {
    render(<CentreSettingsSection />);
    expect(screen.getByTestId('centre-name-display').textContent).toBe("The Adjei's");
  });

  it('renders formatted surplus target', () => {
    render(<CentreSettingsSection />);
    expect(screen.getByTestId('centre-surplus-display').textContent).toBe('GHS 4,500');
  });

  it('shows edit inputs when edit button clicked', async () => {
    render(<CentreSettingsSection />);
    await act(async () => { screen.getByTestId('centre-edit-btn').click(); });
    expect(screen.getByTestId('centre-name-input')).toBeTruthy();
    expect(screen.getByTestId('centre-surplus-input')).toBeTruthy();
  });

  it('pre-fills inputs with current centre values', async () => {
    render(<CentreSettingsSection />);
    await act(async () => { screen.getByTestId('centre-edit-btn').click(); });
    expect(screen.getByTestId('centre-name-input').value).toBe("The Adjei's");
    expect(screen.getByTestId('centre-surplus-input').value).toBe('4500');
  });

  it('calls updateCentre with updated name on save', async () => {
    render(<CentreSettingsSection />);
    await act(async () => { screen.getByTestId('centre-edit-btn').click(); });
    await act(async () => {
      fireEvent.change(screen.getByTestId('centre-name-input'), { target: { value: 'New Name' } });
    });
    await act(async () => { screen.getByTestId('centre-save-btn').click(); });
    expect(mockUpdateCentre).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'New Name' })
    );
  });

  it('shows error when save fails', async () => {
    mockUpdateCentre.mockResolvedValueOnce({ error: new Error('DB error') });
    render(<CentreSettingsSection />);
    await act(async () => { screen.getByTestId('centre-edit-btn').click(); });
    await act(async () => { screen.getByTestId('centre-save-btn').click(); });
    expect(screen.getByText(/Could not save/)).toBeTruthy();
  });

  it('closes edit form after successful save', async () => {
    render(<CentreSettingsSection />);
    await act(async () => { screen.getByTestId('centre-edit-btn').click(); });
    await act(async () => { screen.getByTestId('centre-save-btn').click(); });
    expect(screen.queryByTestId('centre-name-input')).toBeNull();
  });

  it('closes edit form on cancel without saving', async () => {
    render(<CentreSettingsSection />);
    await act(async () => { screen.getByTestId('centre-edit-btn').click(); });
    await act(async () => { screen.getByText('Cancel').click(); });
    expect(screen.queryByTestId('centre-name-input')).toBeNull();
    expect(mockUpdateCentre).not.toHaveBeenCalled();
  });
});
