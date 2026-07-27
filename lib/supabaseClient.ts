import { createBrowserClient } from '@supabase/ssr';

// Uses the public anon key — safe to expose. Row Level Security (see
// supabase/schema.sql) is what actually keeps one user's data away from
// another's, not secrecy of this key.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
