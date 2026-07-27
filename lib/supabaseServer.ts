import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Server-side client used inside API routes. It reads the user's session
// from cookies, so every query is automatically scoped to that user via
// Row Level Security — the API route never has to manually filter by user_id.
export function createServerSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
}

// Admin client with the service-role key — bypasses RLS entirely.
// Only ever use this for trusted server-only work, like the Stripe webhook
// updating a subscription row for a user who isn't making the request.
export function createAdminSupabase() {
  const { createClient } = require('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
