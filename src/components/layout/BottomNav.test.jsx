/**
 * components/layout/BottomNav.test.jsx
 * Component rendering tests for BottomNav.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen }           from '@testing-library/react';
import { MemoryRouter }             from 'react-router-dom';
import { BottomNav }                from './BottomNav';

let mockCan = () => true;
vi.mock('../../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({ can: (p) => mockCan(p) }),
}));

const renderNav = (initialPath = '/') =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <BottomNav />
    </MemoryRouter>
  );

describe('BottomNav', () => {
  beforeEach(() => { mockCan = () => true; });
  it('renders all 5 tabs', () => {
    renderNav();
    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText('Payday')).toBeTruthy();
    expect(screen.getByText('Daily')).toBeTruthy();
    expect(screen.getByText('Budget')).toBeTruthy();
    expect(screen.getByText('Log')).toBeTruthy();
  });

  it('marks Home as active on /', () => {
    renderNav('/');
    expect(screen.getByLabelText('Home').getAttribute('aria-current')).toBe('page');
  });

  it('marks Payday as active on /payday', () => {
    renderNav('/payday');
    expect(screen.getByLabelText('Payday').getAttribute('aria-current')).toBe('page');
  });

  it('marks no other tab active on /payday', () => {
    renderNav('/payday');
    expect(screen.getByLabelText('Home').getAttribute('aria-current')).toBeNull();
  });

  it('standard member does not see Payday tab', () => {
    mockCan = () => false;
    renderNav();
    expect(screen.queryByText('Payday')).toBeNull();
    expect(screen.getByText('Home')).toBeTruthy();
    mockCan = () => true;
  });

  it('exposes a nav-tab-{key} testid on each tab', () => {
    renderNav();
    ['home', 'payday', 'daily', 'budget', 'log'].forEach(key =>
      expect(screen.getByTestId(`nav-tab-${key}`)).toBeTruthy()
    );
  });
});
