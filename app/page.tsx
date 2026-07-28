'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabaseClient';

type Entry = { id: string; title: string; type: string; created_at: string };
type Idea = {
  id: string;
  entry_id: string;
  text: string;
  interval_days: number;
  ease: number;
  reps: number;
  due_date: string;
};

export default function Home() {
  const supabase = createClient();
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [tab, setTab] = useState<'capture' | 'review' | 'library'>('capture');

  const [entries, setEntries] = useState<Entry[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);

  const [title, setTitle] = useState('');
  const [type, setType] = useState('Book');
  const [content, setContent] = useState('');
  const [drafts, setDrafts] = useState<string[]>([]);
  const [status, setStatus] = useState<{ kind: 'idle' | 'loading' | 'error'; msg?: string }>({ kind: 'idle' });

  const [reviewQueue, setReviewQueue] = useState<Idea[]>([]);
  const [reviewIdx, setReviewIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const [search, setSearch] = useState('');

  // ---- auth gate ----
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.push('/login');
      else setCheckingAuth(false);
    });
  }, []);

  // ---- load library ----
  const loadData = useCallback(async () => {
    const res = await fetch('/api/ideas');
    if (!res.ok) return;
    const data = await res.json();
    setEntries(data.entries || []);
    setIdeas(data.ideas || []);
  }, []);

  useEffect(() => {
    if (!checkingAuth) loadData();
  }, [checkingAuth, loadData]);

  const dueIdeas = () => ideas.filter((i) => new Date(i.due_date) <= new Date());

  useEffect(() => {
    if (tab === 'review') {
      const due = dueIdeas();
      setReviewQueue(due);
      setReviewIdx(0);
      setRevealed(false);
    }
  }, [tab, ideas]);

  // ---- capture: extract ----
  async function extractIdeas() {
    if (!content.trim()) {
      alert('Add a bit of text first.');
      return;
    }
    setStatus({ kind: 'loading' });
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, type, content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Extraction failed');
      setDrafts(data.ideas);
      setStatus({ kind: 'idle' });
    } catch (e: any) {
      setStatus({ kind: 'error', msg: e.message });
      setDrafts(['']);
    }
  }

  async function saveEntry() {
    const valid = drafts.filter((d) => d.trim());
    if (valid.length === 0) {
      alert('Add at least one idea before saving.');
      return;
    }
    const res = await fetch('/api/ideas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title || 'Untitled', type, ideas: valid }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert('Save failed: ' + data.error);
      return;
    }
    setTitle('');
    setContent('');
    setDrafts([]);
    setStatus({ kind: 'idle' });
    await loadData();
    setTab('library');
  }

  // ---- export ----
  function exportLibrary() {
    const lines: string[] = [`# Recall export`, `Exported ${new Date().toLocaleString()}`, ''];
    entries.forEach((entry) => {
      const entryIdeas = ideas.filter((i) => i.entry_id === entry.id);
      if (entryIdeas.length === 0) return;
      lines.push(`## ${entry.title} (${entry.type})`, '');
      entryIdeas.forEach((idea) => lines.push(`- ${idea.text}`));
      lines.push('');
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recall-export-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---- review ----
  async function rate(idea: Idea, grade: 'again' | 'hard' | 'good' | 'easy') {
    await fetch(`/api/ideas/${idea.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grade }),
    });
    setRevealed(false);
    setReviewIdx((i) => i + 1);
    await loadData();
  }

  if (checkingAuth) return null;

  const dueCount = dueIdeas().length;

  return (
    <div className="shell">
      <div className="masthead">
        <div className="brand">
          <span className="brand-mark">Recall</span>
          <span className="brand-tag">READING MEMORY LOG</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={() => router.push('/settings')}>
            Settings
          </button>
          <button
            className="btn-ghost"
            onClick={async () => {
              await supabase.auth.signOut();
              router.push('/login');
            }}
          >
            Sign out
          </button>
        </div>
      </div>

      <nav className="tabs">
        <button className={tab === 'capture' ? 'active' : ''} onClick={() => setTab('capture')}>
          CAPTURE
        </button>
        <button className={tab === 'review' ? 'active' : ''} onClick={() => setTab('review')}>
          REVIEW
          {dueCount > 0 && <span className="tab-badge">{dueCount}</span>}
        </button>
        <button className={tab === 'library' ? 'active' : ''} onClick={() => setTab('library')}>
          LIBRARY
        </button>
      </nav>

      {tab === 'capture' && (
        <section className="view active">
          <div className="row">
            <div className="field">
              <label>What did you read</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Atomic Habits, ch. 3" />
            </div>
            <div className="field" style={{ maxWidth: 150 }}>
              <label>Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option>Book</option>
                <option>Article</option>
                <option>Paper</option>
                <option>Podcast</option>
                <option>Note</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Paste what you read, or tell it in your own words</label>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} />
            <div className="hint">Recall reads this and pulls out the ideas worth remembering.</div>
          </div>
          <button className="btn" onClick={extractIdeas} disabled={status.kind === 'loading'}>
            Extract ideas →
          </button>
          {status.kind !== 'idle' && (
            <div className="extract-status">
              {status.kind === 'loading' ? 'Reading it over…' : `Couldn't auto-extract (${status.msg}). Add ideas below.`}
            </div>
          )}

          {drafts.length > 0 && (
            <div style={{ marginTop: 22 }}>
              <label>Ideas to remember</label>
              {drafts.map((d, i) => (
                <div key={i} className="idea-draft">
                  <textarea
                    value={d}
                    onChange={(e) => {
                      const copy = [...drafts];
                      copy[i] = e.target.value;
                      setDrafts(copy);
                    }}
                  />
                  <button className="remove" onClick={() => setDrafts(drafts.filter((_, idx) => idx !== i))}>
                    ×
                  </button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button className="btn" onClick={saveEntry}>
                  Save to library
                </button>
                <button className="btn-ghost" onClick={() => setDrafts([])}>
                  Discard
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {tab === 'review' && (
        <section className="view active">
          {reviewQueue.length === 0 ? (
            <div className="empty">
              <div className="empty-mark">Nothing due right now</div>
              <div className="empty-sub">Come back later, or capture something new.</div>
            </div>
          ) : reviewIdx >= reviewQueue.length ? (
            <div className="empty">
              <div className="empty-mark">Review complete</div>
              <div className="empty-sub">You went through {reviewQueue.length} ideas.</div>
            </div>
          ) : (
            (() => {
              const idea = reviewQueue[reviewIdx];
              const entry = entries.find((e) => e.id === idea.entry_id);
              return (
                <>
                  <div className="review-progress">
                    {reviewIdx + 1} / {reviewQueue.length}
                  </div>
                  <div className="review-stage">
                    <div className="review-eyebrow">
                      {entry?.type} · from "{entry?.title}"
                    </div>
                    <div className="review-prompt">What was the idea here?</div>
                    {!revealed ? (
                      <button className="btn reveal-btn" onClick={() => setRevealed(true)}>
                        Reveal
                      </button>
                    ) : (
                      <>
                        <div className="review-answer">{idea.text}</div>
                        <div className="rate-row">
                          {(['again', 'hard', 'good', 'easy'] as const).map((g) => (
                            <button key={g} className="rate-btn" onClick={() => rate(idea, g)}>
                              <span className="rk">{g}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </>
              );
            })()
          )}
        </section>
      )}

      {tab === 'library' && (
        <section className="view active">
          {entries.length > 0 && (
            <div className="library-toolbar">
              <input
                type="text"
                className="search-input"
                placeholder="Search your saved ideas…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button className="btn-ghost" onClick={exportLibrary}>
                Export
              </button>
            </div>
          )}
          {entries.length === 0 ? (
            <div className="empty">
              <div className="empty-mark">Your library is empty</div>
              <div className="empty-sub">Capture something you read and it'll show up here.</div>
            </div>
          ) : (
            (() => {
              const query = search.trim().toLowerCase();
              const visibleEntries = entries.filter(
                (entry) =>
                  !query ||
                  entry.title.toLowerCase().includes(query) ||
                  ideas.some((i) => i.entry_id === entry.id && i.text.toLowerCase().includes(query))
              );
              if (visibleEntries.length === 0) {
                return (
                  <div className="empty">
                    <div className="empty-mark">No matches</div>
                    <div className="empty-sub">Try a different search term.</div>
                  </div>
                );
              }
              return visibleEntries.map((entry) => {
              const entryIdeas = ideas.filter(
                (i) => i.entry_id === entry.id && (!query || i.text.toLowerCase().includes(query) || entry.title.toLowerCase().includes(query))
              );
              if (entryIdeas.length === 0) return null;
              return (
                <div className="entry-group" key={entry.id}>
                  <div className="entry-head">
                    <div className="entry-title">{entry.title}</div>
                    <div className="entry-meta">
                      {entry.type.toUpperCase()} · {new Date(entry.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  {entryIdeas.map((idea) => {
                    const overdue = new Date(idea.due_date) <= new Date();
                    return (
                      <div className="card" key={idea.id}>
                        <div className="card-text">{idea.text}</div>
                        <div className="card-foot">
                          <div className="decay-bar">
                            <div className={`decay-fill ${overdue ? 'overdue' : ''}`} style={{ width: overdue ? '100%' : '40%' }} />
                          </div>
                          <div className="card-due">
                            {overdue ? 'due now' : 'due ' + new Date(idea.due_date).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
              });
            })()
          )}
        </section>
      )}
    </div>
  );
}
