'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabaseClient';

type Settings = {
  digest_enabled: boolean;
  digest_hour: number;
  timezone: string;
  digest_frequency_days: number;
};

const FREQUENCY_PRESETS = [
  { value: 1, label: 'Daily' },
  { value: 2, label: 'Every 2 days' },
  { value: 3, label: 'Every 3 days' },
  { value: 7, label: 'Weekly' },
  { value: 14, label: 'Every 2 weeks' },
];

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
  const [subscription, setSubscription] = useState<{
    status: string;
    trial_words_used: number;
    trial_word_limit: number;
    trial_youtube_used: number;
    trial_youtube_limit: number;
    sub_words_used: number;
    sub_word_limit: number;
    sub_word_cap_applies: boolean;
  } | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [customFrequency, setCustomFrequency] = useState(false);
  const [origin, setOrigin] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    if (localStorage.getItem('afterword-theme') === 'light') setTheme('light');
  }, []);

  function changeTheme(next: 'dark' | 'light') {
    setTheme(next);
    localStorage.setItem('afterword-theme', next);
    if (next === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

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
            digest_frequency_days: data.settings.digest_frequency_days || 1,
          });
        } else {
          setSettings({
            digest_enabled: true,
            digest_hour: 8,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            digest_frequency_days: 1,
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

  const bookmarklet = origin
    ? `javascript:(function(){var s=window.getSelection().toString();if(!s){alert('Select some text on the page first, then click this bookmark.');}else{window.open('${origin}/app?capture='+encodeURIComponent(s),'_blank');}})();`
    : '';

  return (
    <div className="shell">
      <div className="masthead">
        <div className="brand">
          <span className="brand-mark">Afterword</span>
          <span className="brand-tag">SETTINGS</span>
        </div>
        <button className="btn-ghost" onClick={() => router.push('/app')}>
          Back
        </button>
      </div>

      <section className="view active">
        <div className="field">
          <label>Appearance</label>
          <select value={theme} onChange={(e) => changeTheme(e.target.value as 'dark' | 'light')}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </div>

        {subscription?.status === 'trialing' && (
          <div className="field">
            <label>Usage</label>
            <div className="hint">
              {subscription.trial_words_used.toLocaleString()} / {subscription.trial_word_limit.toLocaleString()} words used in your trial.
              <br />
              {subscription.trial_youtube_used} / {subscription.trial_youtube_limit} YouTube videos used in your trial.
            </div>
          </div>
        )}
        {subscription?.status === 'active' && (
          <div className="field">
            <label>Usage</label>
            <div className="hint">
              {subscription.sub_word_cap_applies
                ? `${subscription.sub_words_used.toLocaleString()} / ${subscription.sub_word_limit.toLocaleString()} words used this billing period. Resets when your subscription renews.`
                : 'Unlimited usage on this account.'}
            </div>
          </div>
        )}

        {origin && (
          <div className="field">
            <label>Capture from anywhere</label>
            <div className="hint" style={{ marginBottom: 10 }}>
              Drag this to your bookmarks bar (don't click it here). Then on any webpage, select some text and click it to send that text straight into Capture.
            </div>
            <a
              href={bookmarklet}
              className="btn-ghost"
              style={{ display: 'inline-block', textDecoration: 'none' }}
              onClick={(e) => e.preventDefault()}
            >
              Send to Afterword
            </a>
          </div>
        )}

        {subscription?.status === 'active' && (
          <div className="field">
            <label>Subscription</label>
            <div className="hint" style={{ marginBottom: 10 }}>
              Your Afterword subscription is active.
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
            Get an email when ideas are waiting for review, so it doesn't slip your mind. Only sends when something's actually due.
          </div>
        </div>

        {settings.digest_enabled && (
          <div className="field">
            <label>Remind me</label>
            <select
              value={
                !customFrequency && FREQUENCY_PRESETS.some((p) => p.value === settings.digest_frequency_days)
                  ? settings.digest_frequency_days
                  : 'custom'
              }
              onChange={(e) => {
                if (e.target.value === 'custom') {
                  setCustomFrequency(true);
                  return;
                }
                setCustomFrequency(false);
                setSettings({ ...settings, digest_frequency_days: parseInt(e.target.value, 10) });
              }}
            >
              {FREQUENCY_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
              <option value="custom">Custom…</option>
            </select>
            {(customFrequency || !FREQUENCY_PRESETS.some((p) => p.value === settings.digest_frequency_days)) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={settings.digest_frequency_days}
                  onChange={(e) =>
                    setSettings({ ...settings, digest_frequency_days: parseInt(e.target.value, 10) || 1 })
                  }
                  style={{ width: 70 }}
                />
                <span className="hint" style={{ margin: 0 }}>days</span>
              </div>
            )}
          </div>
        )}

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
