import { describe, it, expect } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { toAuthUser } from './auth';

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
});
