/**
 * views/settings/AddGuestSheet.test.jsx
 * Written before AddGuestSheet.jsx — TDD.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent }        from '@testing-library/react';
import { AddGuestSheet }                         from './AddGuestSheet';

const mockOnSave  = vi.fn().mockResolvedValue({ error: null });
const mockOnClose = vi.fn();

const renderSheet = (props = {}) =>
  render(
    <AddGuestSheet
      isOpen={true}
      onClose={mockOnClose}
      onSave={mockOnSave}
      categories={['Groceries', 'Transport']}
      {...props}
    />
  );

describe('AddGuestSheet', () => {
  beforeEach(() => { mockOnSave.mockClear(); mockOnClose.mockClear(); });

  it('does not render when closed', () => {
    renderSheet({ isOpen: false });
    expect(screen.queryByTestId('add-guest-name')).toBeNull();
  });

  it('renders name input', () => {
    renderSheet();
    expect(screen.getByTestId('add-guest-name')).toBeTruthy();
  });

  it('renders PIN input', () => {
    renderSheet();
    expect(screen.getByTestId('add-guest-pin')).toBeTruthy();
  });

  it('renders confirm PIN input', () => {
    renderSheet();
    expect(screen.getByTestId('add-guest-confirm-pin')).toBeTruthy();
  });

  it('renders category checkboxes', () => {
    renderSheet();
    expect(screen.getByTestId('guest-cat-check-Groceries')).toBeTruthy();
    expect(screen.getByTestId('guest-cat-check-Transport')).toBeTruthy();
  });

  it('shows Add Guest title when creating', () => {
    renderSheet();
    expect(screen.getByText('Add Guest')).toBeTruthy();
  });

  it('shows Edit Guest title when editing', () => {
    renderSheet({ editGuest: { id: 'g1', name: 'Sarah', allowed_categories: [] } });
    expect(screen.getByText('Edit Guest')).toBeTruthy();
  });

  it('pre-fills name when editing', () => {
    renderSheet({ editGuest: { id: 'g1', name: 'Sarah', allowed_categories: ['Groceries'] } });
    expect(screen.getByTestId('add-guest-name').value).toBe('Sarah');
  });

  it('pre-checks categories when editing', () => {
    renderSheet({ editGuest: { id: 'g1', name: 'Sarah', allowed_categories: ['Groceries'] } });
    expect(screen.getByTestId('guest-cat-check-Groceries').checked).toBe(true);
    expect(screen.getByTestId('guest-cat-check-Transport').checked).toBe(false);
  });

  it('shows validation error when name is empty', async () => {
    renderSheet();
    await act(async () => { screen.getByTestId('add-guest-save-btn').click(); });
    expect(screen.getByText('Please enter a name')).toBeTruthy();
  });

  it('shows validation error when PIN is missing (create mode)', async () => {
    renderSheet();
    await act(async () => { fireEvent.change(screen.getByTestId('add-guest-name'), { target: { value: 'Sarah' } }); });
    await act(async () => { screen.getByTestId('add-guest-save-btn').click(); });
    expect(screen.getByText('Please set a 4-digit PIN')).toBeTruthy();
  });

  it('shows validation error when PIN is not 4 digits', async () => {
    renderSheet();
    await act(async () => { fireEvent.change(screen.getByTestId('add-guest-name'), { target: { value: 'Sarah' } }); });
    await act(async () => { fireEvent.change(screen.getByTestId('add-guest-pin'), { target: { value: '12' } }); });
    await act(async () => { screen.getByTestId('add-guest-save-btn').click(); });
    expect(screen.getByText('PIN must be exactly 4 digits')).toBeTruthy();
  });

  it('shows validation error when PINs do not match', async () => {
    renderSheet();
    await act(async () => { fireEvent.change(screen.getByTestId('add-guest-name'), { target: { value: 'Sarah' } }); });
    await act(async () => { fireEvent.change(screen.getByTestId('add-guest-pin'),         { target: { value: '1234' } }); });
    await act(async () => { fireEvent.change(screen.getByTestId('add-guest-confirm-pin'), { target: { value: '9999' } }); });
    await act(async () => { screen.getByTestId('add-guest-save-btn').click(); });
    expect(screen.getByText('PINs do not match')).toBeTruthy();
  });

  it('calls onSave with name, pin, allowedCategories on valid create', async () => {
    renderSheet();
    await act(async () => { fireEvent.change(screen.getByTestId('add-guest-name'), { target: { value: 'Sarah' } }); });
    await act(async () => { fireEvent.change(screen.getByTestId('add-guest-pin'),         { target: { value: '1234' } }); });
    await act(async () => { fireEvent.change(screen.getByTestId('add-guest-confirm-pin'), { target: { value: '1234' } }); });
    await act(async () => { screen.getByTestId('guest-cat-check-Groceries').click(); });
    await act(async () => { screen.getByTestId('add-guest-save-btn').click(); });
    expect(mockOnSave).toHaveBeenCalledWith({
      name: 'Sarah', pin: '1234', allowedCategories: ['Groceries'],
    });
  });

  it('calls onSave without pin when editing and PIN left blank', async () => {
    renderSheet({ editGuest: { id: 'g1', name: 'Sarah', allowed_categories: [] } });
    await act(async () => { screen.getByTestId('add-guest-save-btn').click(); });
    expect(mockOnSave).toHaveBeenCalledWith(
      expect.not.objectContaining({ pin: expect.anything() })
    );
  });

  it('calls onClose when Cancel clicked', () => {
    renderSheet();
    screen.getByText('Cancel').click();
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('calls onClose after successful save', async () => {
    renderSheet();
    await act(async () => { fireEvent.change(screen.getByTestId('add-guest-name'), { target: { value: 'Sarah' } }); });
    await act(async () => { fireEvent.change(screen.getByTestId('add-guest-pin'),         { target: { value: '1234' } }); });
    await act(async () => { fireEvent.change(screen.getByTestId('add-guest-confirm-pin'), { target: { value: '1234' } }); });
    await act(async () => { screen.getByTestId('add-guest-save-btn').click(); });
    expect(mockOnClose).toHaveBeenCalled();
  });
});
