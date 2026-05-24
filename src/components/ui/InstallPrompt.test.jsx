/**
 * components/ui/InstallPrompt.test.jsx
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { InstallPrompt } from './InstallPrompt';

const mockMatchMedia = (matches) => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
};

describe('InstallPrompt', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockMatchMedia(false); // not standalone
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing before beforeinstallprompt fires', () => {
    render(<InstallPrompt />);
    expect(screen.queryByTestId('install-prompt')).toBeNull();
  });

  it('shows banner after beforeinstallprompt event', async () => {
    render(<InstallPrompt />);
    const mockEvent = { preventDefault: vi.fn(), prompt: vi.fn(), userChoice: Promise.resolve({ outcome: 'dismissed' }) };
    await act(async () => {
      window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), mockEvent));
    });
    expect(screen.getByTestId('install-prompt')).toBeTruthy();
    expect(screen.getByText(/Install Money B\.O\.S/i)).toBeTruthy();
  });

  it('hides banner and sets sessionStorage on Dismiss', async () => {
    render(<InstallPrompt />);
    const mockEvent = { preventDefault: vi.fn(), prompt: vi.fn(), userChoice: Promise.resolve({ outcome: 'dismissed' }) };
    await act(async () => {
      window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), mockEvent));
    });
    fireEvent.click(screen.getByTestId('install-prompt-dismiss'));
    expect(screen.queryByTestId('install-prompt')).toBeNull();
    expect(sessionStorage.getItem('ffc_install_dismissed')).toBe('1');
  });

  it('calls event.prompt() when Install is clicked', async () => {
    render(<InstallPrompt />);
    const mockPrompt = vi.fn();
    const mockEvent = {
      preventDefault: vi.fn(),
      prompt: mockPrompt,
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    };
    await act(async () => {
      window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), mockEvent));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('install-prompt-install'));
    });
    expect(mockPrompt).toHaveBeenCalledOnce();
  });

  it('does not show when already in standalone mode', async () => {
    mockMatchMedia(true); // standalone
    render(<InstallPrompt />);
    const mockEvent = { preventDefault: vi.fn(), prompt: vi.fn(), userChoice: Promise.resolve({ outcome: 'dismissed' }) };
    await act(async () => {
      window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), mockEvent));
    });
    expect(screen.queryByTestId('install-prompt')).toBeNull();
  });

  it('does not show when session dismissed flag is set', async () => {
    sessionStorage.setItem('ffc_install_dismissed', '1');
    render(<InstallPrompt />);
    const mockEvent = { preventDefault: vi.fn(), prompt: vi.fn(), userChoice: Promise.resolve({ outcome: 'dismissed' }) };
    await act(async () => {
      window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), mockEvent));
    });
    expect(screen.queryByTestId('install-prompt')).toBeNull();
  });
});
