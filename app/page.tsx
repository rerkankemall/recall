'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabaseClient';

export default function LandingPage() {
  const supabase = createClient();
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.push('/app');
      else setChecking(false);
    });
  }, []);

  if (checking) return null;

  return (
    <div className="landing-shell">
      <div className="landing-hero">
        <div className="brand">
          <span className="brand-mark">Recall</span>
          <span className="brand-tag">READING MEMORY LOG</span>
        </div>
        <h1 className="landing-headline">You forget most of what you read. Recall fixes that.</h1>
        <p className="landing-sub">
          Paste in what you're reading — a book, an article, a paper — and Recall pulls out
          the ideas worth remembering. Then it brings them back to you on a spaced schedule,
          right when you're about to forget, so they actually stick.
        </p>
        <button className="btn landing-cta" onClick={() => router.push('/login')}>
          Get started →
        </button>
        <div className="landing-note">14-day free trial. No credit card required to start.</div>
      </div>

      <div className="landing-features">
        <div className="landing-feature">
          <div className="landing-feature-title">Capture</div>
          <div className="landing-feature-body">
            Paste in text from anything you're reading. Recall reads it and extracts the ideas
            actually worth holding onto.
          </div>
        </div>
        <div className="landing-feature">
          <div className="landing-feature-title">Review</div>
          <div className="landing-feature-body">
            A simple spaced-repetition schedule brings each idea back right before you'd
            otherwise forget it.
          </div>
        </div>
        <div className="landing-feature">
          <div className="landing-feature-title">Import</div>
          <div className="landing-feature-body">
            Already have years of Kindle or Readwise highlights? Bring them in directly — no
            re-typing required.
          </div>
        </div>
      </div>
    </div>
  );
}
