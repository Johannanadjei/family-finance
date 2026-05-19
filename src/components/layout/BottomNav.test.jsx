/**
 * components/layout/BottomNav.test.jsx
 * Component rendering tests for BottomNav.
 */

import { describe, it, expect } from 'vitest';
import { render, screen }       from '@testing-library/react';
import { MemoryRouter }         from 'react-router-dom';
import { BottomNav }            from './BottomNav';

const renderNav = (initialPath = '/') =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <BottomNav />
    </MemoryRouter>
  );

describe('BottomNav', () => {
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
});
