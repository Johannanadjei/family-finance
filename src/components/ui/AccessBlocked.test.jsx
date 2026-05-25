import { describe, it, expect } from 'vitest';
import { render, screen }       from '@testing-library/react';
import { AccessBlocked }        from './AccessBlocked';

describe('AccessBlocked', () => {
  it('renders default message', () => {
    render(<AccessBlocked />);
    expect(screen.getByTestId('access-blocked')).toBeTruthy();
    expect(screen.getByText(/don't have access/i)).toBeTruthy();
  });

  it('renders custom message', () => {
    render(<AccessBlocked message="Payday is locked." />);
    expect(screen.getByText('Payday is locked.')).toBeTruthy();
  });

  it('always shows contact hub owner text', () => {
    render(<AccessBlocked />);
    expect(screen.getByText(/contact your hub owner/i)).toBeTruthy();
  });
});
