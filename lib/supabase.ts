import { createClient } from '@supabase/supabase-js';

export function getSupabaseConfig(
  env: Record<string, string | undefined> = process.env
): { url: string; anonKey: string } {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY env vars');
  }
  return { url, anonKey };
}

const { url, anonKey } = getSupabaseConfig();
export const supabase = createClient(url, anonKey);
