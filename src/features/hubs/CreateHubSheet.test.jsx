/**
 * features/hubs/CreateHubSheet.test.jsx
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CreateHubSheet }            from './CreateHubSheet';

vi.mock('../../services/centres.service', () => ({
  createCentre: vi.fn().mockResolvedValue({ data: { id: 'new-c-1' }, error: null }),
}));
vi.mock('../../services/categories.service', () => ({
  bulkAddCategories: vi.fn().mockResolvedValue({ error: null }),
}));
vi.mock('../../services/income.service', () => ({
  bulkAddIncomeSources: vi.fn().mockResolvedValue({ error: null }),
}));
vi.mock('../../services/cycles.service', () => ({
  createBudgetPeriod: vi.fn().mockResolvedValue({ data: { id: 'new-cyc-1' }, error: null }),
}));

import { bulkAddCategories } from '../../services/categories.service';
import { createBudgetPeriod } from '../../services/cycles.service';

const renderSheet = (props = {}) =>
  render(
    <CreateHubSheet
      isOpen={true}
      onClose={vi.fn()}
      onComplete={vi.fn()}
      {...props}
    />
  );

/** Helpers — navigate to each step */
const selectHub   = () => fireEvent.click(screen.getByLabelText('Select Family Home'));
const goToStep1   = () => { selectHub(); fireEvent.click(screen.getByText('Continue →')); };
const fillName    = (name = 'Test Hub') => fireEvent.change(screen.getByPlaceholderText('e.g. Our Family Home'), { target: { value: name } });
const goToStep2   = () => { goToStep1(); fillName(); fireEvent.click(screen.getByText('Continue →')); };
const goToStep3   = () => { goToStep2(); fireEvent.click(screen.getByText('Continue →')); };
const goToConfirm = () => { goToStep3(); fireEvent.click(screen.getByText('Skip for now')); };

describe('CreateHubSheet', () => {
  it('renders when isOpen is true', () => {
    renderSheet();
    expect(screen.getByText('What kind of hub?')).toBeTruthy();
  });

  it('does not render content when closed', () => {
    renderSheet({ isOpen: false });
    expect(screen.queryByText('What kind of hub?')).toBeNull();
  });

  it('Continue is disabled until a hub type is selected', () => {
    renderSheet();
    expect(screen.getByText('Continue →').disabled).toBe(true);
  });

  it('Continue enables after selecting a hub type', () => {
    renderSheet();
    selectHub();
    expect(screen.getByText('Continue →').disabled).toBe(false);
  });

  it('advances to name step after selecting hub type and clicking Continue', () => {
    renderSheet();
    goToStep1();
    expect(screen.getByText('Name your hub')).toBeTruthy();
  });

  it('shows progress as Step 1 of 5 on mount', () => {
    renderSheet();
    expect(screen.getByText('Step 1 of 5')).toBeTruthy();
  });

  it('progress advances to Step 2 of 5 on name step', () => {
    renderSheet();
    goToStep1();
    expect(screen.getByText('Step 2 of 5')).toBeTruthy();
  });

  it('Back on name step returns to hub type step', () => {
    renderSheet();
    goToStep1();
    fireEvent.click(screen.getByText('← Back'));
    expect(screen.getByText('What kind of hub?')).toBeTruthy();
  });

  it('shows validation error when name is empty and Continue clicked', () => {
    renderSheet();
    goToStep1();
    fireEvent.click(screen.getByText('Continue →'));
    expect(screen.getByText('Please give your hub a name.')).toBeTruthy();
  });

  it('calls onClose when the close button is tapped', () => {
    const onClose = vi.fn();
    renderSheet({ onClose });
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows categories step after name is filled and continued', () => {
    renderSheet();
    goToStep2();
    expect(screen.getByText('Set your budget categories')).toBeTruthy();
  });

  it('pre-populates family home categories', () => {
    renderSheet();
    goToStep2();
    expect(screen.getByDisplayValue('Rent / Mortgage')).toBeTruthy();
  });

  it('pre-populates rental categories when rental hub type selected', () => {
    renderSheet();
    fireEvent.click(screen.getByLabelText('Select Rental Property'));
    fireEvent.click(screen.getByText('Continue →'));
    fillName('Airbnb');
    fireEvent.click(screen.getByText('Continue →'));
    expect(screen.getByDisplayValue('Cleaning')).toBeTruthy();
  });

  it('shows confirm step after categories continued', () => {
    renderSheet();
    goToConfirm();
    expect(screen.getByText('Ready to create?')).toBeTruthy();
  });

  it('shows hub name in confirm summary', () => {
    renderSheet();
    goToConfirm();
    expect(screen.getByText(/Test Hub/)).toBeTruthy();
  });

  it('shows income step after categories continued', () => {
    renderSheet();
    goToStep3();
    expect(screen.getByText('Add your income streams')).toBeTruthy();
  });

  it('income step has Skip for now button', () => {
    renderSheet();
    goToStep3();
    expect(screen.getByText('Skip for now')).toBeTruthy();
  });

  it('Back on income step returns to categories', () => {
    renderSheet();
    goToStep3();
    fireEvent.click(screen.getByText('← Back'));
    expect(screen.getByText('Set your budget categories')).toBeTruthy();
  });

  it('shows confirm step after skipping income', () => {
    renderSheet();
    goToConfirm();
    expect(screen.getByText('Ready to create?')).toBeTruthy();
  });

  // Phase B (anchor pivot): the confirm path creates the hub's first budget period via
  // create_budget_period (calendar-month default for today) before bulk-inserting,
  // then stamps categories with the new cycle id.
  it('calls onComplete with new centre id after successful creation', async () => {
    const onComplete = vi.fn();
    renderSheet({ onComplete });
    goToConfirm();
    fireEvent.click(screen.getByText('Create Hub 🎉'));
    await vi.waitFor(() => expect(onComplete).toHaveBeenCalledWith('new-c-1'));
  });

  it('creates the first budget period and stamps categories with its id (CYC02 closure)', async () => {
    renderSheet();
    goToConfirm();
    fireEvent.click(screen.getByText('Create Hub 🎉'));
    await vi.waitFor(() => expect(createBudgetPeriod).toHaveBeenCalledWith('new-c-1', expect.objectContaining({
      startDate: expect.stringMatching(/^\d{4}-\d{2}-01$/),
      endDate:   expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    })));
    await vi.waitFor(() => expect(bulkAddCategories).toHaveBeenCalledWith('new-c-1', expect.anything(), 'new-cyc-1'));
  });

  it('exposes all 8 data-testids at the right step (stop-before-submit: submit asserted, never clicked)', () => {
    const onComplete = vi.fn();
    renderSheet({ onComplete });

    // Step 0 — sheet container + close present from mount
    expect(screen.getByTestId('create-hub-sheet')).toBeTruthy();
    expect(screen.getByTestId('create-hub-close-btn')).toBeTruthy();

    // Step 1 — inputs + nav buttons
    goToStep1();
    expect(screen.getByTestId('create-hub-name-input')).toBeTruthy();
    expect(screen.getByTestId('create-hub-currency-select')).toBeTruthy();
    expect(screen.getByTestId('create-hub-back-btn')).toBeTruthy();
    expect(screen.getByTestId('create-hub-continue-btn')).toBeTruthy();

    // Step 1 validation — empty name + Continue surfaces the error testid (pre-submit, Stage 1)
    fireEvent.click(screen.getByTestId('create-hub-continue-btn'));
    expect(screen.getByTestId('create-hub-name-error')).toBeTruthy();

    // Advance to the Confirm step (step 4): name → categories → income(skip) → confirm
    fillName();
    fireEvent.click(screen.getByTestId('create-hub-continue-btn'));  // → step 2 (categories)
    fireEvent.click(screen.getByText('Continue →'));                 // → step 3 (income)
    fireEvent.click(screen.getByText('Skip for now'));               // → step 4 (confirm)

    // Step 4 — submit + shared back present; submit asserted but NEVER clicked.
    expect(screen.getByTestId('create-hub-submit-btn')).toBeTruthy();
    expect(screen.getByTestId('create-hub-back-btn')).toBeTruthy();   // shared testid, step-4 instance
    expect(onComplete).not.toHaveBeenCalled();                        // stop-before-submit honoured
  });
});
