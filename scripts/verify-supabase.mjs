import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  console.error('Fill in .env.local, then run: npm run verify-supabase');
  process.exit(1);
}

const supabase = createClient(url, anonKey);
const { error } = await supabase.from('rooms').select('code').limit(1);

if (error) {
  console.error(`Connection failed: ${error.message}`);
  if (error.code === '42P01') {
    console.error(
      '-> the "rooms" table does not exist yet. Run supabase/migrations/0001_create_rooms.sql in the Supabase SQL Editor.'
    );
  }
  process.exit(1);
}

console.log(`Connected to Supabase successfully — "rooms" table is reachable at ${url}`);
