import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabaseServer';
import { getResend, digestEmailHtml } from '@/lib/resend';

// GET /api/cron/digest
// Meant to be hit once an hour by an external scheduler (e.g. cron-job.org),
// not by Vercel Cron (free tier there only allows once-a-day schedules,
// which isn't enough to honor each user's own chosen local hour).
// Protected by CRON_SECRET so randoms can't trigger it or enumerate users.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminSupabase();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const { data: settings, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('digest_enabled', true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = new Date();
  let sent = 0;

  for (const s of settings || []) {
    if (currentHourInTimezone(now, s.timezone) !== s.digest_hour) continue;
    if (s.last_digest_sent_at && daysBetweenUtcDates(new Date(s.last_digest_sent_at), now) < (s.digest_frequency_days || 1)) {
      continue;
    }

    const { data: ideas } = await supabase
      .from('ideas')
      .select('text')
      .eq('user_id', s.user_id)
      .lte('due_date', now.toISOString());

    if (!ideas || ideas.length === 0) continue;

    const { data: userData } = await supabase.auth.admin.getUserById(s.user_id);
    const email = userData?.user?.email;
    if (!email) continue;

    await getResend().emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'Afterword <onboarding@resend.dev>',
      to: email,
      subject: `${ideas.length} idea${ideas.length === 1 ? '' : 's'} due for review`,
      html: digestEmailHtml(ideas, appUrl),
    });

    await supabase
      .from('user_settings')
      .update({ last_digest_sent_at: now.toISOString() })
      .eq('user_id', s.user_id);

    sent += 1;
  }

  return NextResponse.json({ checked: settings?.length || 0, sent });
}

function currentHourInTimezone(date: Date, timeZone: string) {
  const hourStr = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(date);
  return parseInt(hourStr, 10);
}

function daysBetweenUtcDates(a: Date, b: Date) {
  const aDay = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const bDay = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((bDay - aDay) / (1000 * 60 * 60 * 24));
}
