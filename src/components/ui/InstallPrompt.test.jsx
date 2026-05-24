/**
 * components/ui/InstallPrompt.test.jsx
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../lib/pwa', () => ({
  getInstallPrompt:   vi.fn(() => null),
  triggerInstall:     vi.fn(async () => ({ outcome: 'accepted' })),
  clearInstallPrompt: vi.fn(),
}));

import { getInstallPrompt, triggerInstall } from '../../lib/pwa';

const setStandalone = (matches) => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({ matches, media: '', onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }),
  });
};

const setUserAgent = (ua) => {
  Object.defineProperty(navigator, 'userAgent', { writable: true, value: ua });
};

// ── Android — prompt already captured before mount ─────────────────────────────
describe('InstallPrompt — Android prompt captured before mount', () => {
  beforeEach(() => {
    sessionStorage.clear();
    setUserAgent('Mozilla/5.0 (Linux; Android 13) Chrome/120');
    setStandalone(false);
    getInstallPrompt.mockReturnValue({ prompt: vi.fn(), userChoice: Promise.resolve({ outcome: 'dismissed' }) });
    triggerInstall.mockResolvedValue({ outcome: 'accepted' });
  });

  afterEach(() => vi.restoreAllMocks());

  it('shows native install banner immediately', async () => {
    const { InstallPrompt } = await import('./InstallPrompt');
    render(<InstallPrompt />);
    expect(screen.getByTestId('install-prompt')).toBeTruthy();
    expect(screen.getByTestId('install-prompt-install')).toBeTruthy();
  });

  it('hides banner and sets sessionStorage on Dismiss', async () => {
    const { InstallPrompt } = await import('./InstallPrompt');
    render(<InstallPrompt />);
    fireEvent.click(screen.getByTestId('install-prompt-dismiss'));
    expect(screen.queryByTestId('install-prompt')).toBeNull();
    expect(sessionStorage.getItem('ffc_install_dismissed')).toBe('1');
  });

  it('calls triggerInstall on Install click', async () => {
    const { InstallPrompt } = await import('./InstallPrompt');
    render(<InstallPrompt />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('install-prompt-install'));
    });
    expect(triggerInstall).toHaveBeenCalledOnce();
  });

  it('does not show when session dismissed flag is set', async () => {
    sessionStorage.setItem('ffc_install_dismissed', '1');
    const { InstallPrompt } = await import('./InstallPrompt');
    render(<InstallPrompt />);
    expect(screen.queryByTestId('install-prompt')).toBeNull();
  });
});

// ── Android — no prompt, shows after pwaInstallReady event ────────────────────
describe('InstallPrompt — Android prompt fires after mount', () => {
  beforeEach(() => {
    sessionStorage.clear();
    setUserAgent('Mozilla/5.0 (Linux; Android 13) Chrome/120');
    setStandalone(false);
    getInstallPrompt.mockReturnValue(null);
    triggerInstall.mockResolvedValue({ outcome: 'accepted' });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows native banner when pwaInstallReady fires before fallback timer', async () => {
    const { InstallPrompt } = await import('./InstallPrompt');
    render(<InstallPrompt />);
    expect(screen.queryByTestId('install-prompt')).toBeNull();
    await act(async () => {
      window.dispatchEvent(new CustomEvent('pwaInstallReady'));
    });
    expect(screen.getByTestId('install-prompt')).toBeTruthy();
    expect(screen.getByTestId('install-prompt-install')).toBeTruthy();
    // Advance past fallback timer — should stay as native banner, not switch to manual
    await act(async () => { vi.advanceTimersByTime(11000); });
    expect(screen.getByTestId('install-prompt-install')).toBeTruthy();
  });
});

// ── Android — 10-second fallback manual instructions ─────────────────────────
describe('InstallPrompt — Android manual fallback', () => {
  beforeEach(() => {
    sessionStorage.clear();
    setUserAgent('Mozilla/5.0 (Linux; Android 13) Chrome/120');
    setStandalone(false);
    getInstallPrompt.mockReturnValue(null);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders nothing before 10 seconds', async () => {
    const { InstallPrompt } = await import('./InstallPrompt');
    render(<InstallPrompt />);
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(screen.queryByTestId('install-prompt')).toBeNull();
  });

  it('shows manual instructions banner after 10 seconds', async () => {
    const { InstallPrompt } = await import('./InstallPrompt');
    render(<InstallPrompt />);
    await act(async () => { vi.advanceTimersByTime(11000); });
    expect(screen.getByTestId('install-prompt')).toBeTruthy();
    expect(screen.getByText(/Add to Home Screen/i)).toBeTruthy();
  });

  it('does not show manual banner if session dismissed before timer fires', async () => {
    const { InstallPrompt } = await import('./InstallPrompt');
    render(<InstallPrompt />);
    sessionStorage.setItem('ffc_install_dismissed', '1');
    await act(async () => { vi.advanceTimersByTime(11000); });
    expect(screen.queryByTestId('install-prompt')).toBeNull();
  });

  it('dismisses manual banner and sets sessionStorage', async () => {
    const { InstallPrompt } = await import('./InstallPrompt');
    render(<InstallPrompt />);
    await act(async () => { vi.advanceTimersByTime(11000); });
    fireEvent.click(screen.getByTestId('install-prompt-dismiss'));
    expect(screen.queryByTestId('install-prompt')).toBeNull();
    expect(sessionStorage.getItem('ffc_install_dismissed')).toBe('1');
  });
});

// ── Standalone mode ────────────────────────────────────────────────────────────
describe('InstallPrompt — standalone mode', () => {
  beforeEach(() => {
    sessionStorage.clear();
    setUserAgent('Mozilla/5.0 Chrome/120');
    setStandalone(true);
    vi.resetModules();
  });

  it('renders nothing in standalone mode', async () => {
    vi.doMock('../../lib/pwa', () => ({
      getInstallPrompt:   vi.fn(() => ({ prompt: vi.fn() })),
      triggerInstall:     vi.fn(async () => ({ outcome: 'accepted' })),
      clearInstallPrompt: vi.fn(),
    }));
    const { InstallPrompt } = await import('./InstallPrompt');
    render(<InstallPrompt />);
    expect(screen.queryByTestId('install-prompt')).toBeNull();
  });
});
