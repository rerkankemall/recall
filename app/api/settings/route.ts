import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabaseServer';

// GET /api/settings -> the signed-in user's digest preferences (creates defaults if missing)
export async function GET() {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (data) return NextResponse.json({ settings: data });

  const { data: created, error: insertErr } = await supabase
    .from('user_settings')
    .insert({ user_id: user.id })
    .select()
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
  return NextResponse.json({ settings: created });
}

// POST /api/settings  { digest_enabled, digest_hour, timezone, digest_frequency_days }
export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { digest_enabled, digest_hour, timezone, digest_frequency_days } = await req.json();

  const { data, error } = await supabase
    .from('user_settings')
    .upsert({
      user_id: user.id,
      digest_enabled,
      digest_hour,
      timezone,
      digest_frequency_days: Math.max(1, Math.min(60, Number(digest_frequency_days) || 1)),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}
