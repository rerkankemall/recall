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
    <div style={{ maxWidth: 380, margin: '80px auto', padding: '0 20px', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: 22, marginBottom: 20 }}>Sign in to Afterword</h1>
      {sent ? (
        <p>Check your email — we sent a sign-in link to {email}.</p>
      ) : (
        <form onSubmit={sendLink}>
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%', padding: 10, marginBottom: 10 }}
          />
          <button type="submit" style={{ width: '100%', padding: 10 }}>
            Send magic link
          </button>
          {error && <p style={{ color: 'crimson', marginTop: 10 }}>{error}</p>}
        </form>
      )}
    </div>
  );
}
