import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabaseServer';
import { dateKey, computeStreakAndWeek } from '@/lib/reviewStats';

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

  const reviewedAts = (rows || []).map((r) => r.reviewed_at);
  const { streak, reviewedThisWeek, totalReviews } = computeStreakAndWeek(reviewedAts);

  const counts = new Map<string, number>();
  reviewedAts.forEach((r) => {
    const key = dateKey(new Date(r));
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const grid: { date: string; count: number }[] = [];
  for (let i = 83; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = dateKey(d);
    grid.push({ date: key, count: counts.get(key) || 0 });
  }

  return NextResponse.json({ totalReviews, streak, reviewedThisWeek, grid });
}
