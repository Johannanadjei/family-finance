import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getUserSession, signUpUser, signInUser, signOutUser, resetPasswordForEmail } from './auth.service';

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser:               vi.fn(),
      signUp:                vi.fn(),
      signInWithPassword:    vi.fn(),
      signOut:               vi.fn(),
      resetPasswordForEmail: vi.fn(),
    },
  },
}));

import { supabase } from '../lib/supabase';

beforeEach(() => { vi.clearAllMocks(); });

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
  it('calls signUp with email and password', async () => {
    supabase.auth.signUp.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null });
    await signUpUser('a@b.com', 'pass123');
    expect(supabase.auth.signUp).toHaveBeenCalledWith({ email: 'a@b.com', password: 'pass123' });
  });

  it('returns user data on success', async () => {
    supabase.auth.signUp.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null });
    const { data, error } = await signUpUser('a@b.com', 'pass123');
    expect(data.user.id).toBe('u-1');
    expect(error).toBeNull();
  });

  it('returns error on failure', async () => {
    supabase.auth.signUp.mockResolvedValue({ data: null, error: { message: 'Email already in use' } });
    const { error } = await signUpUser('a@b.com', 'pass123');
    expect(error).toBeTruthy();
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

describe('resetPasswordForEmail', () => {
  it('calls resetPasswordForEmail with the given email', async () => {
    supabase.auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    await resetPasswordForEmail('a@b.com');
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.com');
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
