'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabaseClient';

type Settings = {
  digest_enabled: boolean;
  digest_hour: number;
  timezone: string;
};

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const TIMEZONES = (typeof Intl.supportedValuesOf === 'function'
  ? Intl.supportedValuesOf('timeZone')
  : ['UTC']) as string[];

function formatHour(h: number) {
  const period = h < 12 ? 'AM' : 'PM';
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  return `${displayHour}:00 ${period}`;
}

export default function SettingsPage() {
  const supabase = createClient();
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [subscription, setSubscription] = useState<{ status: string } | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.push('/login');
      else setCheckingAuth(false);
    });
  }, []);

  useEffect(() => {
    if (checkingAuth) return;
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data.settings) {
          setSettings({
            digest_enabled: data.settings.digest_enabled,
            digest_hour: data.settings.digest_hour,
            timezone: data.settings.timezone,
          });
        } else {
          setSettings({
            digest_enabled: true,
            digest_hour: 8,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          });
        }
      });
    fetch('/api/subscription')
      .then((res) => res.json())
      .then((data) => setSubscription(data));
  }, [checkingAuth]);

  async function manageSubscription() {
    setOpeningPortal(true);
    const res = await fetch('/api/stripe/portal', { method: 'POST' });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else {
      alert('Could not open billing portal: ' + (data.error || 'unknown error'));
      setOpeningPortal(false);
    }
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    setSaved(true);
  }

  if (checkingAuth || !settings) return null;

  return (
    <div className="shell">
      <div className="masthead">
        <div className="brand">
          <span className="brand-mark">Recall</span>
          <span className="brand-tag">SETTINGS</span>
        </div>
        <button className="btn-ghost" onClick={() => router.push('/')}>
          Back
        </button>
      </div>

      <section className="view active">
        {subscription?.status === 'active' && (
          <div className="field">
            <label>Subscription</label>
            <div className="hint" style={{ marginBottom: 10 }}>
              Your Recall subscription is active.
            </div>
            <button className="btn-ghost" onClick={manageSubscription} disabled={openingPortal}>
              {openingPortal ? 'Opening…' : 'Manage subscription'}
            </button>
          </div>
        )}

        <div className="field">
          <label>Daily review reminder email</label>
          <select
            value={settings.digest_enabled ? 'on' : 'off'}
            onChange={(e) =>
              setSettings({ ...settings, digest_enabled: e.target.value === 'on' })
            }
          >
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
          <div className="hint">
            Sends once a day, only if you have ideas due for review.
          </div>
        </div>

        {settings.digest_enabled && (
          <div className="row">
            <div className="field">
              <label>Time of day</label>
              <select
                value={settings.digest_hour}
                onChange={(e) =>
                  setSettings({ ...settings, digest_hour: parseInt(e.target.value, 10) })
                }
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {formatHour(h)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Timezone</label>
              <select
                value={settings.timezone}
                onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <button className="btn" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="hint" style={{ marginLeft: 12 }}>Saved.</span>}
      </section>
    </div>
  );
}
