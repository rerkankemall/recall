import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabaseServer';
import { getResend, weeklyRecapEmailHtml } from '@/lib/resend';
import { computeStreakAndWeek } from '@/lib/reviewStats';

// GET /api/cron/weekly-recap
// Meant to be hit once a week by the external scheduler (e.g. cron-job.org).
// Emails anyone with digest_enabled who reviewed at least one idea in the
// past 7 days their review count + current streak. Silent for users with
// zero activity that week, to avoid a discouraging "you reviewed 0" email.
// Protected by CRON_SECRET so randoms can't trigger it or enumerate users.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminSupabase();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const now = new Date();

  const { data: settings, error } = await supabase
    .from('user_settings')
    .select('user_id, last_weekly_recap_sent_at')
    .eq('digest_enabled', true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;

  for (const s of settings || []) {
    if (s.last_weekly_recap_sent_at) {
      const daysSinceLast = (now.getTime() - new Date(s.last_weekly_recap_sent_at).getTime()) / (24 * 60 * 60 * 1000);
      if (daysSinceLast < 6) continue;
    }

    const { data: rows } = await supabase
      .from('review_log')
      .select('reviewed_at')
      .eq('user_id', s.user_id);

    const reviewedAts = (rows || []).map((r: { reviewed_at: string }) => r.reviewed_at);
    const { streak, reviewedThisWeek } = computeStreakAndWeek(reviewedAts);
    if (reviewedThisWeek === 0) continue;

    const { data: userData } = await supabase.auth.admin.getUserById(s.user_id);
    const email = userData?.user?.email;
    if (!email) continue;

    await getResend().emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'Afterword <onboarding@resend.dev>',
      to: email,
      subject: `${reviewedThisWeek} idea${reviewedThisWeek === 1 ? '' : 's'} reviewed this week`,
      html: weeklyRecapEmailHtml(reviewedThisWeek, streak, appUrl),
    });

    await supabase.from('user_settings').update({ last_weekly_recap_sent_at: now.toISOString() }).eq('user_id', s.user_id);

    sent += 1;
  }

  return NextResponse.json({ checked: settings?.length || 0, sent });
}
