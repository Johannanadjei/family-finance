/**
 * views/auth/authValidation.test.js
 *
 * Pure helpers extracted from AuthScreen. Behaviour is unchanged from the inline
 * versions — these tests pin it so the extraction stays honest.
 */

import { describe, it, expect } from 'vitest';
import { validateForm, mapAuthError } from './authValidation';

describe('validateForm', () => {
  it('accepts a valid sign-in', () => {
    expect(validateForm('a@b.com', 'secret1', '', 'signin')).toBeNull();
  });

  it('accepts a valid sign-up with a name', () => {
    expect(validateForm('a@b.com', 'secret1', 'Alice', 'signup')).toBeNull();
  });

  it('requires an email', () => {
    expect(validateForm('   ', 'secret1', '', 'signin')).toBe('Email is required');
  });

  it('rejects a malformed email', () => {
    expect(validateForm('nope', 'secret1', '', 'signin')).toBe('Please enter a valid email address');
  });

  it('requires a password', () => {
    expect(validateForm('a@b.com', '', '', 'signin')).toBe('Password is required');
  });

  it('enforces a 6 character minimum password', () => {
    expect(validateForm('a@b.com', 'abc', '', 'signin')).toBe('Password must be at least 6 characters');
  });

  it('requires a name on sign-up only', () => {
    expect(validateForm('a@b.com', 'secret1', '', 'signup')).toBe('Please enter your name');
    expect(validateForm('a@b.com', 'secret1', '', 'signin')).toBeNull();
  });
});

describe('mapAuthError', () => {
  it('maps invalid credentials to friendly copy', () => {
    expect(mapAuthError('Invalid login credentials')).toBe('Incorrect email or password');
  });

  it('maps a duplicate account', () => {
    expect(mapAuthError('User already registered')).toBe('An account with this email already exists');
  });

  it('maps a network failure', () => {
    expect(mapAuthError('Failed to fetch')).toBe('Connection failed. Please try again.');
  });

  it('maps a blocked popup', () => {
    expect(mapAuthError('popup blocked')).toBe('Please allow popups for Google sign in');
  });

  it('falls back to a generic message when there is none', () => {
    expect(mapAuthError('')).toBe('Something went wrong. Please try again.');
    expect(mapAuthError(undefined)).toBe('Something went wrong. Please try again.');
  });

  it('passes through an unrecognised message', () => {
    expect(mapAuthError('Something odd happened')).toBe('Something odd happened');
  });
});
