import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabaseServer';
import { getOrCreateSubscription, isEntitled, TRIAL_WORD_LIMIT } from '@/lib/entitlement';

// GET /api/subscription -> trial/paid status for the signed-in user
export async function GET() {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const sub = await getOrCreateSubscription(user.id);
  return NextResponse.json({
    status: sub.status,
    trial_ends_at: sub.trial_ends_at,
    entitled: isEntitled(sub),
    trial_words_used: sub.trial_words_used,
    trial_word_limit: TRIAL_WORD_LIMIT,
  });
}
