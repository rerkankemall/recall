import { createAdminSupabase } from './supabaseServer';
import { getResend } from './resend';

const ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// Emails the site owner about an operational issue (e.g. a shared third-party
// quota running out), but at most once per day per alert `key` so a burst of
// failing requests doesn't flood their inbox. Best-effort: failures here are
// swallowed so a broken alert never breaks the request that triggered it.
export async function alertOncePerDay(key: string, subject: string, message: string) {
  const adminEmail = process.env.ADMIN_ALERT_EMAIL;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!adminEmail || !fromEmail) return;

  try {
    const admin = createAdminSupabase();
    const { data: existing } = await admin
      .from('system_alerts')
      .select('last_sent_at')
      .eq('key', key)
      .maybeSingle();

    if (existing && Date.now() - new Date(existing.last_sent_at).getTime() < ALERT_COOLDOWN_MS) {
      return;
    }

    await admin.from('system_alerts').upsert({ key, last_sent_at: new Date().toISOString() });

    await getResend().emails.send({
      from: fromEmail,
      to: adminEmail,
      subject,
      html: `<p>${message}</p>`,
    });
  } catch {
    // best-effort — never let alerting break the caller
  }
}
