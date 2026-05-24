/**
 * views/settings/CentreSettingsSection.test.jsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent }        from '@testing-library/react';
import { CentreSettingsSection }                 from './CentreSettingsSection';
import { mockCentre, mockFmt }                   from '../../test-utils/fixtures';

// Use vi.fn() for useBudgetCentreContext so we can vary centreCount per test
vi.mock('../../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: vi.fn(),
}));

import { useBudgetCentreContext } from '../../context/BudgetCentreContext';

const mockUpdateCentre        = vi.fn().mockResolvedValue({ error: null });
const mockArchiveCentre       = vi.fn().mockResolvedValue({ error: null });
const mockPermanentDeleteCentre = vi.fn().mockResolvedValue({ error: null });

const makeCtx = (centreCount = 2) => ({
  centre:               mockCentre,
  fmt:                  mockFmt,
  updateCentre:         mockUpdateCentre,
  archiveCentre:        mockArchiveCentre,
  permanentDeleteCentre: mockPermanentDeleteCentre,
  centreCount,
});

describe('CentreSettingsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBudgetCentreContext.mockReturnValue(makeCtx(2));
  });

  it('renders centre name', () => {
    render(<CentreSettingsSection />);
    expect(screen.getByTestId('centre-name-display').textContent).toBe("The Adjei's");
  });

  it('renders currency display', () => {
    render(<CentreSettingsSection />);
    expect(screen.getByTestId('centre-currency-display').textContent).toBe('GHS');
  });

  it('shows edit inputs when edit button clicked', async () => {
    render(<CentreSettingsSection />);
    await act(async () => { screen.getByTestId('centre-edit-btn').click(); });
    expect(screen.getByTestId('centre-name-input')).toBeTruthy();
    expect(screen.getByTestId('centre-currency-select')).toBeTruthy();
  });

  it('pre-fills inputs with current centre values', async () => {
    render(<CentreSettingsSection />);
    await act(async () => { screen.getByTestId('centre-edit-btn').click(); });
    expect(screen.getByTestId('centre-name-input').value).toBe("The Adjei's");
    expect(screen.getByTestId('centre-currency-select').value).toBe('GHS');
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

  it('calls updateCentre with selected currency on save', async () => {
    render(<CentreSettingsSection />);
    await act(async () => { screen.getByTestId('centre-edit-btn').click(); });
    await act(async () => {
      fireEvent.change(screen.getByTestId('centre-currency-select'), { target: { value: 'USD' } });
    });
    await act(async () => { screen.getByTestId('centre-save-btn').click(); });
    expect(mockUpdateCentre).toHaveBeenCalledWith(
      expect.objectContaining({ currency: 'USD' })
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

  it('shows error and does not save when name is empty', async () => {
    render(<CentreSettingsSection />);
    await act(async () => { screen.getByTestId('centre-edit-btn').click(); });
    await act(async () => {
      fireEvent.change(screen.getByTestId('centre-name-input'), { target: { value: '' } });
    });
    await act(async () => { screen.getByTestId('centre-save-btn').click(); });
    expect(screen.getByText('Please enter a name')).toBeTruthy();
    expect(mockUpdateCentre).not.toHaveBeenCalled();
  });

  // ── Danger zone ────────────────────────────────────────────────────────────

  it('shows Archive this hub button when centreCount > 1', () => {
    render(<CentreSettingsSection />);
    expect(screen.getByTestId('archive-hub-btn')).toBeTruthy();
    expect(screen.queryByTestId('archive-blocked-msg')).toBeNull();
  });

  it('shows blocked message and no archive button when centreCount is 1', () => {
    useBudgetCentreContext.mockReturnValue(makeCtx(1));
    render(<CentreSettingsSection />);
    expect(screen.getByTestId('archive-blocked-msg')).toBeTruthy();
    expect(screen.queryByTestId('archive-hub-btn')).toBeNull();
  });

  it('opens ArchiveHubSheet when archive button clicked', async () => {
    render(<CentreSettingsSection />);
    await act(async () => { screen.getByTestId('archive-hub-btn').click(); });
    expect(screen.getByTestId('archive-hub-dialog')).toBeTruthy();
  });
});
