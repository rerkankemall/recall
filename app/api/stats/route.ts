import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabaseServer';

// GET /api/stats -> review streak + activity for the signed-in user
export async function GET() {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { data: rows, error } = await supabase
    .from('review_log')
    .select('reviewed_at')
    .eq('user_id', user.id)
    .order('reviewed_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const dateKey = (d: Date) => d.toISOString().slice(0, 10);
  const counts = new Map<string, number>();
  (rows || []).forEach((r) => {
    const key = dateKey(new Date(r.reviewed_at));
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  const totalReviews = rows?.length || 0;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  let streak = 0;
  {
    const cursor = new Date(today);
    if (!counts.has(dateKey(cursor))) {
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    while (counts.has(dateKey(cursor))) {
      streak++;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
  }

  let reviewedThisWeek = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    reviewedThisWeek += counts.get(dateKey(d)) || 0;
  }

  const grid: { date: string; count: number }[] = [];
  for (let i = 83; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = dateKey(d);
    grid.push({ date: key, count: counts.get(key) || 0 });
  }

  return NextResponse.json({ totalReviews, streak, reviewedThisWeek, grid });
}
