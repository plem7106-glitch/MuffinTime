import { describe, it, expect } from 'vitest';
import { getSupabaseConfig } from './supabase';

describe('getSupabaseConfig', () => {
  it('returns the url and anon key from the given env', () => {
    const config = getSupabaseConfig({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    });
    expect(config).toEqual({ url: 'https://example.supabase.co', anonKey: 'anon-key' });
  });

  it('throws when the URL is missing', () => {
    expect(() => getSupabaseConfig({ NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key' })).toThrow(/Missing/);
  });

  it('throws when the anon key is missing', () => {
    expect(() => getSupabaseConfig({ NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' })).toThrow(/Missing/);
  });
});
