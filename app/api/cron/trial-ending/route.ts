import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabaseServer';
import { getResend, trialEndingEmailHtml } from '@/lib/resend';

// GET /api/cron/trial-ending
// Meant to be hit hourly by the same external scheduler as /api/cron/digest.
// Sends a one-time "your trial ends soon" reminder to trialing users with
// 2 days or less left, so they don't just get cut off with no warning.
// Protected by CRON_SECRET so randoms can't trigger it or enumerate users.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminSupabase();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const now = new Date();

  const { data: subs, error } = await supabase
    .from('subscriptions')
    .select('user_id, trial_ends_at')
    .eq('status', 'trialing')
    .eq('trial_reminder_sent', false);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;

  for (const sub of subs || []) {
    if (!sub.trial_ends_at) continue;

    const msLeft = new Date(sub.trial_ends_at).getTime() - now.getTime();
    const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
    if (daysLeft > 2 || daysLeft <= 0) continue;

    const { data: userData } = await supabase.auth.admin.getUserById(sub.user_id);
    const email = userData?.user?.email;
    if (!email) continue;

    await getResend().emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'Afterword <onboarding@resend.dev>',
      to: email,
      subject: daysLeft <= 1 ? 'Your Afterword trial ends tomorrow' : `Your Afterword trial ends in ${daysLeft} days`,
      html: trialEndingEmailHtml(daysLeft, appUrl),
    });

    await supabase.from('subscriptions').update({ trial_reminder_sent: true }).eq('user_id', sub.user_id);

    sent += 1;
  }

  return NextResponse.json({ checked: subs?.length || 0, sent });
}
