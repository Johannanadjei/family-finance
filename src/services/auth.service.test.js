import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getUserSession, signUpUser, signInUser, signOutUser, resetPasswordForEmail, resolveResetRedirect, waitForSession, updateUserName } from './auth.service';

const mockUpsert = vi.fn().mockResolvedValue({ error: null });

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser:               vi.fn(),
      getSession:            vi.fn(),
      signUp:                vi.fn(),
      signInWithPassword:    vi.fn(),
      signOut:               vi.fn(),
      resetPasswordForEmail: vi.fn(),
    },
    from: vi.fn(() => ({ upsert: mockUpsert })),
  },
}));

import { supabase } from '../lib/supabase';

beforeEach(() => { vi.clearAllMocks(); mockUpsert.mockResolvedValue({ error: null }); });

describe('getUserSession', () => {
  it('returns user data on success', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null });
    const { data, error } = await getUserSession();
    expect(data.user.id).toBe('u-1');
    expect(error).toBeNull();
  });

  it('returns error on failure', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: null, error: { message: 'auth error' } });
    const { error } = await getUserSession();
    expect(error).toBeTruthy();
  });
});

describe('signUpUser', () => {
  it('calls signUp with email, password, and full_name metadata', async () => {
    supabase.auth.signUp.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null });
    await signUpUser('a@b.com', 'pass123', 'Alice');
    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: 'a@b.com', password: 'pass123',
      options: { data: { full_name: 'Alice' } },
    });
  });

  it('upserts user profile to users table on success', async () => {
    supabase.auth.signUp.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null });
    await signUpUser('a@b.com', 'pass123', 'Alice');
    expect(supabase.from).toHaveBeenCalledWith('users');
    expect(mockUpsert).toHaveBeenCalledWith(
      { id: 'u-1', name: 'Alice', email: 'a@b.com' },
      { onConflict: 'id' }
    );
  });

  it('returns user data on success', async () => {
    supabase.auth.signUp.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null });
    const { data, error } = await signUpUser('a@b.com', 'pass123', 'Alice');
    expect(data.user.id).toBe('u-1');
    expect(error).toBeNull();
  });

  it('upsert failure is non-fatal — still returns success', async () => {
    supabase.auth.signUp.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null });
    mockUpsert.mockResolvedValueOnce({ error: { message: 'db error' } });
    const { data, error } = await signUpUser('a@b.com', 'pass123', 'Alice');
    expect(data.user.id).toBe('u-1');
    expect(error).toBeNull();
  });

  it('does not upsert when signup fails', async () => {
    supabase.auth.signUp.mockResolvedValue({ data: null, error: { message: 'Email already in use' } });
    const { error } = await signUpUser('a@b.com', 'pass123', 'Alice');
    expect(error).toBeTruthy();
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

describe('signInUser', () => {
  it('calls signInWithPassword with email and password', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null });
    await signInUser('a@b.com', 'pass123');
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.com', password: 'pass123' });
  });

  it('returns user data on success', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null });
    const { data, error } = await signInUser('a@b.com', 'pass123');
    expect(data.user.id).toBe('u-1');
    expect(error).toBeNull();
  });

  it('returns error on failure', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({ data: null, error: { message: 'Invalid credentials' } });
    const { error } = await signInUser('a@b.com', 'pass123');
    expect(error).toBeTruthy();
  });
});

describe('signOutUser', () => {
  it('returns no error on success', async () => {
    supabase.auth.signOut.mockResolvedValue({ error: null });
    const { error } = await signOutUser();
    expect(error).toBeNull();
  });

  it('returns error on failure', async () => {
    supabase.auth.signOut.mockResolvedValue({ error: { message: 'network error' } });
    const { error } = await signOutUser();
    expect(error).toBeTruthy();
  });
});

// The recovery link is useless without a redirectTo — GoTrue falls back to the project
// Site URL, which is not /reset-password. These lock the allow-list in place; it must
// stay in sync with the Redirect URLs configured in Supabase Auth.
describe('resolveResetRedirect', () => {
  it('returns an origin-relative reset URL for the production origin', () => {
    expect(resolveResetRedirect('https://moneybos.com')).toBe('https://moneybos.com/reset-password');
  });

  it('returns an origin-relative reset URL for the allow-listed dev origin', () => {
    expect(resolveResetRedirect('http://localhost:5173')).toBe('http://localhost:5173/reset-password');
  });

  it('falls back to production for an origin that is not allow-listed', () => {
    expect(resolveResetRedirect('https://evil.example.com')).toBe('https://moneybos.com/reset-password');
  });

  it('falls back to production for a www subdomain (Supabase wildcards cover paths, not subdomains)', () => {
    expect(resolveResetRedirect('https://www.moneybos.com')).toBe('https://moneybos.com/reset-password');
  });

  it('falls back to production for an empty origin', () => {
    expect(resolveResetRedirect('')).toBe('https://moneybos.com/reset-password');
  });
});

describe('resetPasswordForEmail', () => {
  it('calls resetPasswordForEmail with the given email AND a redirectTo', async () => {
    supabase.auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    await resetPasswordForEmail('a@b.com');
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      'a@b.com',
      { redirectTo: resolveResetRedirect(window.location.origin) },
    );
  });

  it('always sends a redirectTo pointing at the reset screen', async () => {
    supabase.auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    await resetPasswordForEmail('a@b.com');
    const [, options] = supabase.auth.resetPasswordForEmail.mock.calls[0];
    expect(options.redirectTo).toMatch(/\/reset-password$/);
  });

  it('honours an explicit redirectTo override', async () => {
    supabase.auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    await resetPasswordForEmail('a@b.com', 'https://moneybos.com/reset-password');
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      'a@b.com',
      { redirectTo: 'https://moneybos.com/reset-password' },
    );
  });

  it('returns no error on success', async () => {
    supabase.auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    const { error } = await resetPasswordForEmail('a@b.com');
    expect(error).toBeNull();
  });

  it('returns error on failure', async () => {
    supabase.auth.resetPasswordForEmail.mockResolvedValue({ error: { message: 'rate limited' } });
    const { error } = await resetPasswordForEmail('a@b.com');
    expect(error).toBeTruthy();
  });
});

describe('updateUserName', () => {
  it('upserts name and email to users table', async () => {
    await updateUserName('u-1', 'Alice', 'a@b.com');
    expect(supabase.from).toHaveBeenCalledWith('users');
    expect(mockUpsert).toHaveBeenCalledWith(
      { id: 'u-1', name: 'Alice', email: 'a@b.com' },
      { onConflict: 'id' }
    );
  });

  it('returns no error on success', async () => {
    const { error } = await updateUserName('u-1', 'Alice', 'a@b.com');
    expect(error).toBeNull();
  });

  it('returns error on failure', async () => {
    mockUpsert.mockResolvedValueOnce({ error: { message: 'db error' } });
    const { error } = await updateUserName('u-1', 'Alice', 'a@b.com');
    expect(error).toBeTruthy();
  });
});

describe('waitForSession', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns session when immediately available', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } }, error: null });
    const { data, error } = await waitForSession();
    expect(data?.access_token).toBe('tok');
    expect(error).toBeNull();
  });

  it('returns error immediately when getSession errors', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: null, error: new Error('network') });
    const { data, error } = await waitForSession();
    expect(data).toBeNull();
    expect(error.message).toBe('network');
  });

  it('retries and returns session on second attempt', async () => {
    let call = 0;
    supabase.auth.getSession.mockImplementation(async () => {
      call++;
      return call === 1
        ? { data: { session: null }, error: null }
        : { data: { session: { access_token: 'tok' } }, error: null };
    });
    const promise = waitForSession();
    await vi.runAllTimersAsync();
    const { data, error } = await promise;
    expect(error).toBeNull();
    expect(data?.access_token).toBe('tok');
  });

  it('returns Session not established after all attempts fail', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const promise = waitForSession(2);
    await vi.runAllTimersAsync();
    const { data, error } = await promise;
    expect(data).toBeNull();
    expect(error.message).toMatch(/session not established/i);
  });
});
