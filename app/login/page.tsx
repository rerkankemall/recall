'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabaseClient';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const supabase = createClient();

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/app` },
    });
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <div className="shell" style={{ maxWidth: 420 }}>
      <div className="brand" style={{ justifyContent: 'center', marginTop: 40, marginBottom: 32 }}>
        <span className="brand-mark">Afterword</span>
        <span className="brand-tag">READING MEMORY LOG</span>
      </div>

      {sent ? (
        <div className="field">
          <label>Check your email</label>
          <div className="hint" style={{ fontSize: 14, color: 'var(--ink)' }}>
            We sent a sign-in link to {email}. Click it to continue — no password needed.
          </div>
          <div className="hint" style={{ marginTop: 10 }}>
            Don't see it after a minute or two? Check your spam/junk folder — new senders sometimes land there at first.
          </div>
        </div>
      ) : (
        <form onSubmit={sendLink}>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
            <div className="hint">
              We'll email you a link — no password to create or remember. New here? This starts your free 14-day trial automatically.
            </div>
          </div>
          <button className="btn" type="submit" style={{ width: '100%' }}>
            Continue
          </button>
          {error && (
            <div className="hint" style={{ color: 'var(--rust)', marginTop: 10 }}>
              {error}
            </div>
          )}
        </form>
      )}
    </div>
  );
}
