import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LoadingScreen, ErrorScreen, RemovedScreen } from './StateScreens';

describe('LoadingScreen', () => {
  it('renders the message and brand lockup', () => {
    render(<LoadingScreen message="Setting up your dashboard..." />);
    expect(screen.getByText('Setting up your dashboard...')).toBeTruthy();
    expect(screen.getByText('Money B.O.S')).toBeTruthy();
  });
});

describe('ErrorScreen', () => {
  it('renders the error message', () => {
    render(<ErrorScreen message="Could not load your hub" />);
    expect(screen.getByText('Could not load your hub')).toBeTruthy();
  });
});

describe('RemovedScreen', () => {
  it('renders the removed-from-hub heading', () => {
    render(<RemovedScreen otherCentres={[]} onSwitchHub={vi.fn()} onSignOut={vi.fn()} />);
    expect(screen.getByText('Removed from hub')).toBeTruthy();
  });

  it('shows a switch button when other centres exist and calls onSwitchHub with its id', () => {
    const onSwitchHub = vi.fn();
    render(<RemovedScreen otherCentres={[{ id: 'c-2', name: 'Side Hub' }]} onSwitchHub={onSwitchHub} onSignOut={vi.fn()} />);
    const switchBtn = screen.getByText('Switch to Side Hub');
    fireEvent.click(switchBtn);
    expect(onSwitchHub).toHaveBeenCalledWith('c-2');
  });

  it('hides the switch button when there are no other centres', () => {
    render(<RemovedScreen otherCentres={[]} onSwitchHub={vi.fn()} onSignOut={vi.fn()} />);
    expect(screen.queryByText(/^Switch to/)).toBeNull();
  });

  it('calls onSignOut when sign out is clicked', () => {
    const onSignOut = vi.fn();
    render(<RemovedScreen otherCentres={[]} onSwitchHub={vi.fn()} onSignOut={onSignOut} />);
    fireEvent.click(screen.getByText('Sign out'));
    expect(onSignOut).toHaveBeenCalled();
  });
});
