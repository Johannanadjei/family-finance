/**
 * views/guest/GuestTransactionForm.test.jsx
 * Written before GuestTransactionForm.jsx — TDD.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent }        from '@testing-library/react';
import { GuestTransactionForm }                  from './GuestTransactionForm';

const mockSubmitGuestTransaction = vi.fn().mockResolvedValue({ data: 'tx-uuid', error: null });

vi.mock('../../services/guests.service', () => ({
  submitGuestTransaction: (...args) => mockSubmitGuestTransaction(...args),
}));

const mockSession = {
  guestId:           'guest-1',
  guestName:         'Sarah',
  allowedCategories: ['Groceries', 'Transport'],
  centreId:          'c1',
  sessionToken:      'd'.repeat(64),   // proof of PIN entry (P0-B, 2026-07-30)
};

const renderForm = (props = {}) =>
  render(
    <GuestTransactionForm
      session={mockSession}
      currency="GHS"
      onSignOut={vi.fn()}
      {...props}
    />
  );

describe('GuestTransactionForm', () => {
  beforeEach(() => { mockSubmitGuestTransaction.mockClear(); });

  it('shows the guest name in the header', () => {
    renderForm();
    expect(screen.getByText(/Sarah/)).toBeTruthy();
  });

  it('renders amount input', () => {
    renderForm();
    expect(screen.getByTestId('guest-amount-input')).toBeTruthy();
  });

  it('renders description input', () => {
    renderForm();
    expect(screen.getByTestId('guest-description-input')).toBeTruthy();
  });

  it('renders allowed category chips', () => {
    renderForm();
    expect(screen.getByTestId('guest-cat-Groceries')).toBeTruthy();
    expect(screen.getByTestId('guest-cat-Transport')).toBeTruthy();
  });

  it('does not render category chips when allowedCategories is empty', () => {
    renderForm({ session: { ...mockSession, allowedCategories: [] } });
    expect(screen.queryByTestId('guest-cat-Groceries')).toBeNull();
  });

  it('renders date inputs pre-filled with today', () => {
    const today = new Date();
    renderForm();
    expect(screen.getByTestId('guest-date-day').value).toBe(String(today.getDate()));
    expect(screen.getByTestId('guest-date-month').value).toBe(String(today.getMonth() + 1));
    expect(screen.getByTestId('guest-date-year').value).toBe(String(today.getFullYear()));
  });

  it('renders Save Expense button', () => {
    renderForm();
    expect(screen.getByTestId('guest-save-btn')).toBeTruthy();
    expect(screen.getByText('Save Expense')).toBeTruthy();
  });

  it('shows error when amount is empty on submit', async () => {
    renderForm();
    await act(async () => { screen.getByTestId('guest-save-btn').click(); });
    expect(screen.getByTestId('guest-form-error')).toBeTruthy();
    expect(screen.getByText(/amount greater than zero/)).toBeTruthy();
  });

  it('shows error when amount is zero', async () => {
    renderForm();
    await act(async () => { fireEvent.change(screen.getByTestId('guest-amount-input'), { target: { value: '0' } }); });
    await act(async () => { screen.getByTestId('guest-save-btn').click(); });
    expect(screen.getByText(/amount greater than zero/)).toBeTruthy();
  });

  it('calls submitGuestTransaction with correct args on valid submit', async () => {
    renderForm();
    await act(async () => { fireEvent.change(screen.getByTestId('guest-amount-input'), { target: { value: '150' } }); });
    await act(async () => { screen.getByTestId('guest-cat-Groceries').click(); });
    await act(async () => { screen.getByTestId('guest-save-btn').click(); });
    expect(mockSubmitGuestTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        guestId:      'guest-1',
        centreId:     'c1',
        amount:       150,
        categoryName: 'Groceries',
        currency:     'GHS',
        sessionToken: mockSession.sessionToken,
      })
    );
  });

  it('shows a re-authenticate prompt when the guest session is rejected', async () => {
    // GST01 is not a save failure — retrying cannot help, only re-entering the PIN
    // can, so the guest must be told that rather than shown "could not save".
    const sessionErr = new Error('Your guest session has expired. Please enter your PIN again to keep logging expenses.');
    sessionErr.code = 'GST01';
    mockSubmitGuestTransaction.mockResolvedValueOnce({ data: null, error: sessionErr });

    renderForm();
    await act(async () => { fireEvent.change(screen.getByTestId('guest-amount-input'), { target: { value: '150' } }); });
    await act(async () => { screen.getByTestId('guest-save-btn').click(); });

    expect(screen.getByTestId('guest-session-expired').textContent).toMatch(/PIN again/i);
    expect(screen.queryByTestId('guest-form-error')).toBeNull();
  });

  it('re-authenticate button signs the guest out back to the PIN screen', async () => {
    const sessionErr = new Error('Your guest session has expired. Please enter your PIN again to keep logging expenses.');
    sessionErr.code = 'GST01';
    mockSubmitGuestTransaction.mockResolvedValueOnce({ data: null, error: sessionErr });
    const onSignOut = vi.fn();

    renderForm({ onSignOut });
    await act(async () => { fireEvent.change(screen.getByTestId('guest-amount-input'), { target: { value: '150' } }); });
    await act(async () => { screen.getByTestId('guest-save-btn').click(); });
    await act(async () => { screen.getByTestId('guest-reauth-btn').click(); });

    expect(onSignOut).toHaveBeenCalled();
  });

  it('still shows the generic error for a non-session failure', async () => {
    mockSubmitGuestTransaction.mockResolvedValueOnce({ data: null, error: new Error('category_not_allowed: Rent') });

    renderForm();
    await act(async () => { fireEvent.change(screen.getByTestId('guest-amount-input'), { target: { value: '150' } }); });
    await act(async () => { screen.getByTestId('guest-save-btn').click(); });

    expect(screen.getByTestId('guest-form-error').textContent).toMatch(/Could not save/i);
    expect(screen.queryByTestId('guest-session-expired')).toBeNull();
  });

  it('uses Other when no category selected', async () => {
    renderForm();
    await act(async () => { fireEvent.change(screen.getByTestId('guest-amount-input'), { target: { value: '100' } }); });
    await act(async () => { screen.getByTestId('guest-save-btn').click(); });
    expect(mockSubmitGuestTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ categoryName: 'Other' })
    );
  });

  it('shows success message after save', async () => {
    renderForm();
    await act(async () => { fireEvent.change(screen.getByTestId('guest-amount-input'), { target: { value: '100' } }); });
    await act(async () => { screen.getByTestId('guest-save-btn').click(); });
    expect(screen.getByTestId('guest-success-msg')).toBeTruthy();
  });

  it('resets form after successful save', async () => {
    renderForm();
    await act(async () => { fireEvent.change(screen.getByTestId('guest-amount-input'), { target: { value: '100' } }); });
    await act(async () => { screen.getByTestId('guest-save-btn').click(); });
    expect(screen.getByTestId('guest-amount-input').value).toBe('');
  });

  it('shows error when RPC fails', async () => {
    mockSubmitGuestTransaction.mockResolvedValueOnce({ data: null, error: new Error('rpc fail') });
    renderForm();
    await act(async () => { fireEvent.change(screen.getByTestId('guest-amount-input'), { target: { value: '100' } }); });
    await act(async () => { screen.getByTestId('guest-save-btn').click(); });
    expect(screen.getByText(/Could not save/)).toBeTruthy();
  });

  it('calls onSignOut when sign out button clicked', () => {
    const onSignOut = vi.fn();
    renderForm({ onSignOut });
    screen.getByText('Sign out').click();
    expect(onSignOut).toHaveBeenCalled();
  });

  it('shows error for invalid day on submit', async () => {
    renderForm();
    await act(async () => { fireEvent.change(screen.getByTestId('guest-amount-input'), { target: { value: '100' } }); });
    await act(async () => { fireEvent.change(screen.getByTestId('guest-date-day'), { target: { value: '50' } }); });
    await act(async () => { screen.getByTestId('guest-save-btn').click(); });
    expect(screen.getByText('Please enter a valid day (1-31)')).toBeTruthy();
  });

  it('shows error for invalid month on submit', async () => {
    renderForm();
    await act(async () => { fireEvent.change(screen.getByTestId('guest-amount-input'), { target: { value: '100' } }); });
    await act(async () => { fireEvent.change(screen.getByTestId('guest-date-month'), { target: { value: '15' } }); });
    await act(async () => { screen.getByTestId('guest-save-btn').click(); });
    expect(screen.getByText('Please enter a valid month (1-12)')).toBeTruthy();
  });

  it('shows error for invalid date combination on submit', async () => {
    renderForm();
    await act(async () => { fireEvent.change(screen.getByTestId('guest-amount-input'), { target: { value: '100' } }); });
    await act(async () => { fireEvent.change(screen.getByTestId('guest-date-day'),   { target: { value: '31' } }); });
    await act(async () => { fireEvent.change(screen.getByTestId('guest-date-month'), { target: { value: '2'  } }); });
    await act(async () => { fireEvent.change(screen.getByTestId('guest-date-year'),  { target: { value: '2026' } }); });
    await act(async () => { screen.getByTestId('guest-save-btn').click(); });
    expect(screen.getByText('Please enter a valid date')).toBeTruthy();
  });
});
