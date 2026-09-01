import { describe, it, expect } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { toAuthUser, sanitizeRedirectPath } from './auth';

function fakeSession(overrides: { id?: string; email?: string; name?: string }): Session {
  return {
    user: {
      id: overrides.id ?? 'user-1',
      email: overrides.email ?? 'friend@example.com',
      user_metadata: overrides.name ? { name: overrides.name } : {},
    },
  } as unknown as Session;
}

describe('toAuthUser', () => {
  it('returns null when there is no session', () => {
    expect(toAuthUser(null)).toBeNull();
  });

  it('maps id, email, and metadata name from the session', () => {
    const session = fakeSession({ id: 'abc-123', email: 'bank@example.com', name: 'Bank' });
    expect(toAuthUser(session)).toEqual({ id: 'abc-123', email: 'bank@example.com', name: 'Bank' });
  });

  it('falls back to the email when user_metadata has no name', () => {
    const session = fakeSession({ id: 'abc-123', email: 'bank@example.com' });
    expect(toAuthUser(session)).toEqual({ id: 'abc-123', email: 'bank@example.com', name: 'bank@example.com' });
  });

  it('falls back to default Thai name when both name and email are missing', () => {
    const session = fakeSession({ id: 'abc-123', email: '' });
    expect(toAuthUser(session)).toEqual({ id: 'abc-123', email: '', name: 'ผู้เล่น' });
  });
});

describe('sanitizeRedirectPath', () => {
  it('returns "/" when path is empty, null, or undefined', () => {
    expect(sanitizeRedirectPath('')).toBe('/');
    expect(sanitizeRedirectPath(null)).toBe('/');
    expect(sanitizeRedirectPath(undefined)).toBe('/');
  });

  it('preserves valid internal relative paths', () => {
    expect(sanitizeRedirectPath('/')).toBe('/');
    expect(sanitizeRedirectPath('/room/ABCD')).toBe('/room/ABCD');
    expect(sanitizeRedirectPath('/create')).toBe('/create');
    expect(sanitizeRedirectPath('/join/XYZ')).toBe('/join/XYZ');
  });

  it('rejects external URLs and open-redirect vectors', () => {
    expect(sanitizeRedirectPath('https://evil.com')).toBe('/');
    expect(sanitizeRedirectPath('http://evil.com')).toBe('/');
    expect(sanitizeRedirectPath('//evil.com')).toBe('/');
    expect(sanitizeRedirectPath('/\\evil.com')).toBe('/');
    expect(sanitizeRedirectPath('javascript:alert(1)')).toBe('/');
    expect(sanitizeRedirectPath('data:text/html,evil')).toBe('/');
  });

  it('rejects paths with newlines or control characters', () => {
    expect(sanitizeRedirectPath('/room/123\n/evil')).toBe('/');
  });
});

