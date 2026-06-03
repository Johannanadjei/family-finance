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
  createCycleByAnchor: vi.fn().mockResolvedValue({ data: { id: 'new-cyc-1' }, error: null }),
  getCyclesForCentre:  vi.fn().mockResolvedValue({ data: [], error: null }),
}));

import { bulkAddCategories } from '../../services/categories.service';
import { createCycleByAnchor } from '../../services/cycles.service';

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

  // TODO(Phase B): Phase A of the anchor pivot replaced first-cycle creation
  // (createCycleByAnchor) with a deliberate "Phase B not yet implemented" throw, so
  // the hub-creation confirm path cannot complete. Re-enable + rewrite these once the
  // user-driven create_budget_period flow lands. See engineering-decisions.md.
  it.skip('calls onComplete with new centre id after successful creation', async () => {
    const onComplete = vi.fn();
    renderSheet({ onComplete });
    goToConfirm();
    fireEvent.click(screen.getByText('Create Hub 🎉'));
    await vi.waitFor(() => expect(onComplete).toHaveBeenCalledWith('new-c-1'));
  });

  it.skip('creates the first cycle and stamps categories with its id (CYC02 closure)', async () => {
    renderSheet();
    goToConfirm();
    fireEvent.click(screen.getByText('Create Hub 🎉'));
    await vi.waitFor(() => expect(createCycleByAnchor).toHaveBeenCalledWith('new-c-1', expect.objectContaining({ anchor_type: 'calendar' })));
    await vi.waitFor(() => expect(bulkAddCategories).toHaveBeenCalledWith('new-c-1', expect.anything(), 'new-cyc-1'));
  });
});
