'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabaseClient';

type Entry = { id: string; title: string; type: string; created_at: string; tags: string[]; summary: string | null };
type Idea = {
  id: string;
  entry_id: string;
  text: string;
  interval_days: number;
  ease: number;
  reps: number;
  due_date: string;
};
type QuizQuestion = {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
};

const SAMPLE_TITLE = 'Atomic Habits, ch. 1';
const SAMPLE_TYPE = 'Book';
const SAMPLE_CONTENT =
  "You do not rise to the level of your goals. You fall to the level of your systems. Habits are the compound interest of self-improvement: getting 1 percent better every day counts for a lot in the long run. Small habits don't add up — they compound, because each one multiplies the effect of the others.";

export default function Home() {
  const supabase = createClient();
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [tab, setTab] = useState<'capture' | 'review' | 'library' | 'stats' | 'import'>('capture');

  const [entries, setEntries] = useState<Entry[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);

  const [title, setTitle] = useState('');
  const [type, setType] = useState('Book');
  const [content, setContent] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [drafts, setDrafts] = useState<string[]>([]);
  const [status, setStatus] = useState<{ kind: 'idle' | 'loading' | 'error'; msg?: string }>({ kind: 'idle' });
  const [summary, setSummary] = useState('');
  const [summarizing, setSummarizing] = useState(false);

  const [quiz, setQuiz] = useState<QuizQuestion[] | null>(null);
  const [quizzing, setQuizzing] = useState(false);
  const [quizIdx, setQuizIdx] = useState(0);
  const [quizSelected, setQuizSelected] = useState<number | null>(null);
  const [quizScore, setQuizScore] = useState(0);

  const [reviewQueue, setReviewQueue] = useState<Idea[]>([]);
  const [reviewIdx, setReviewIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [tagsEditInput, setTagsEditInput] = useState('');
  const [titleEditInput, setTitleEditInput] = useState('');

  function openEntry(entryId: string) {
    setSelected(new Set());
    setOpenEntryId(entryId);
    const entry = entries.find((e) => e.id === entryId);
    setTagsEditInput((entry?.tags || []).join(', '));
    setTitleEditInput(entry?.title || '');
  }

  function closeEntry() {
    setSelected(new Set());
    setOpenEntryId(null);
  }

  async function saveEntryMeta(entry: Entry) {
    const tags = tagsEditInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const title = titleEditInput.trim();
    if (!title) {
      alert('Title cannot be empty.');
      return;
    }
    const res = await fetch(`/api/entries/${entry.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags, title }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert('Could not save changes: ' + data.error);
      return;
    }
    await loadData();
  }

  const [subscription, setSubscription] = useState<{
    status: string;
    trial_ends_at: string | null;
    entitled: boolean;
    trial_words_used: number;
    trial_word_limit: number;
  } | null>(null);

  function toggleSelect(ideaId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ideaId)) next.delete(ideaId);
      else next.add(ideaId);
      return next;
    });
  }

  // ---- auth gate ----
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.push('/login');
      else setCheckingAuth(false);
    });
  }, []);

  // ---- pre-fill Capture from the "Send to Afterword" bookmarklet ----
  useEffect(() => {
    if (checkingAuth) return;
    const captured = new URLSearchParams(window.location.search).get('capture');
    if (captured) {
      setContent(captured);
      setTab('capture');
      window.history.replaceState({}, '', '/app');
    }
  }, [checkingAuth]);

  // ---- load library ----
  const [dataLoaded, setDataLoaded] = useState(false);
  const loadData = useCallback(async () => {
    const res = await fetch('/api/ideas');
    if (!res.ok) return;
    const data = await res.json();
    setEntries(data.entries || []);
    setIdeas(data.ideas || []);
    setDataLoaded(true);
  }, []);

  useEffect(() => {
    if (!checkingAuth) loadData();
  }, [checkingAuth, loadData]);

  const loadSubscription = useCallback(async () => {
    const res = await fetch('/api/subscription');
    if (!res.ok) return;
    setSubscription(await res.json());
  }, []);

  useEffect(() => {
    if (!checkingAuth) loadSubscription();
  }, [checkingAuth, loadSubscription]);

  const [stats, setStats] = useState<{
    totalReviews: number;
    streak: number;
    reviewedThisWeek: number;
    grid: { date: string; count: number }[];
  } | null>(null);

  const loadStats = useCallback(async () => {
    const res = await fetch('/api/stats');
    if (!res.ok) return;
    setStats(await res.json());
  }, []);

  useEffect(() => {
    if (!checkingAuth) loadStats();
  }, [checkingAuth, loadStats]);

  async function upgrade() {
    const res = await fetch('/api/stripe/checkout', { method: 'POST' });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else alert('Could not start checkout: ' + (data.error || 'unknown error'));
  }

  const trialDaysLeft = subscription?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(subscription.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

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
  function fillSample() {
    setTitle(SAMPLE_TITLE);
    setType(SAMPLE_TYPE);
    setContent(SAMPLE_CONTENT);
  }

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
      if (Array.isArray(data.tags) && data.tags.length > 0) {
        setTagsInput(data.tags.join(', '));
      }
      setStatus({ kind: 'idle' });
      await loadSubscription();
    } catch (e: any) {
      setStatus({ kind: 'error', msg: e.message });
      setDrafts(['']);
    }
  }

  async function summarizeContent() {
    if (!content.trim()) {
      alert('Add a bit of text first.');
      return;
    }
    setSummarizing(true);
    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, type, content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Summarization failed');
      setSummary(data.summary);
      await loadSubscription();
    } catch (e: any) {
      alert("Couldn't summarize: " + e.message);
    } finally {
      setSummarizing(false);
    }
  }

  async function startQuiz() {
    if (!content.trim()) {
      alert('Add a bit of text first.');
      return;
    }
    setQuizzing(true);
    try {
      const res = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, type, content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Quiz generation failed');
      setQuiz(data.questions);
      setQuizIdx(0);
      setQuizSelected(null);
      setQuizScore(0);
      await loadSubscription();
    } catch (e: any) {
      alert("Couldn't generate a quiz: " + e.message);
    } finally {
      setQuizzing(false);
    }
  }

  function selectQuizOption(idx: number) {
    if (quizSelected !== null || !quiz) return;
    setQuizSelected(idx);
    if (idx === quiz[quizIdx].answerIndex) {
      setQuizScore((s) => s + 1);
    }
  }

  function nextQuizQuestion() {
    setQuizIdx((i) => i + 1);
    setQuizSelected(null);
  }

  function closeQuiz() {
    setQuiz(null);
    setQuizIdx(0);
    setQuizSelected(null);
    setQuizScore(0);
  }

  async function saveEntry() {
    const valid = drafts.filter((d) => d.trim());
    if (valid.length === 0 && !summary.trim()) {
      alert('Add at least one idea, or generate a summary, before saving.');
      return;
    }
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const res = await fetch('/api/ideas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title || 'Untitled', type, ideas: valid, tags, summary }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert('Save failed: ' + data.error);
      return;
    }
    setTitle('');
    setContent('');
    setTagsInput('');
    setDrafts([]);
    setSummary('');
    setStatus({ kind: 'idle' });
    await loadData();
    setTab('library');
  }

  // ---- import ----
  const [importFormat, setImportFormat] = useState<'kindle' | 'readwise'>('kindle');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importStatus, setImportStatus] = useState<{ kind: 'idle' | 'loading' | 'error' | 'done'; msg?: string }>({
    kind: 'idle',
  });

  async function runImport() {
    if (!importFile) {
      alert('Choose a file first.');
      return;
    }
    setImportStatus({ kind: 'loading' });
    try {
      const content = await importFile.text();
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: importFormat, content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      setImportStatus({
        kind: 'done',
        msg: `Imported ${data.ideasImported} highlight${data.ideasImported === 1 ? '' : 's'} across ${data.entriesCreated} new file${data.entriesCreated === 1 ? '' : 's'}${data.duplicatesSkipped > 0 ? ` (skipped ${data.duplicatesSkipped} already-imported duplicates)` : ''}.`,
      });
      setImportFile(null);
      await loadData();
    } catch (e: any) {
      setImportStatus({ kind: 'error', msg: e.message });
    }
  }

  // ---- export ----
  function downloadMarkdown(filename: string, lines: string[]) {
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportLibrary() {
    const lines: string[] = [`# Afterword export`, `Exported ${new Date().toLocaleString()}`, ''];
    entries.forEach((entry) => {
      const entryIdeas = ideas.filter((i) => i.entry_id === entry.id);
      if (entryIdeas.length === 0 && !entry.summary) return;
      lines.push(`## ${entry.title} (${entry.type})`, '');
      if (entry.summary) lines.push(`_${entry.summary}_`, '');
      entryIdeas.forEach((idea) => lines.push(`- ${idea.text}`));
      lines.push('');
    });
    downloadMarkdown(`afterword-export-${new Date().toISOString().slice(0, 10)}.md`, lines);
  }

  function exportEntry(entry: Entry) {
    const onlySelected = selected.size > 0;
    const entryIdeas = ideas.filter((i) => i.entry_id === entry.id && (!onlySelected || selected.has(i.id)));
    const lines: string[] = [
      `# ${entry.title}`,
      `${entry.type} · ${new Date(entry.created_at).toLocaleDateString()}`,
      '',
    ];
    if (entry.summary) lines.push(`_${entry.summary}_`, '');
    entryIdeas.forEach((idea) => lines.push(`- ${idea.text}`));
    const safeName = entry.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'entry';
    downloadMarkdown(`${safeName}.md`, lines);
  }

  // ---- delete ----
  async function deleteIdea(idea: Idea) {
    if (!confirm('Delete this saved idea? This can\'t be undone.')) return;
    await fetch(`/api/ideas/${idea.id}`, { method: 'DELETE' });
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(idea.id);
      return next;
    });
    await loadData();
  }

  async function deleteEntry(entry: Entry) {
    if (!confirm(`Delete "${entry.title}" and all its saved ideas? This can't be undone.`)) return;
    await fetch(`/api/entries/${entry.id}`, { method: 'DELETE' });
    if (openEntryId === entry.id) closeEntry();
    await loadData();
  }

  // ---- review ----
  async function rate(idea: Idea, grade: 'again' | 'hard' | 'good' | 'easy') {
    const res = await fetch(`/api/ideas/${idea.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grade }),
    });
    if (!res.ok) {
      alert("Couldn't save that rating — please try again.");
      return;
    }
    setRevealed(false);
    setReviewIdx((i) => i + 1);
    await loadData();
    await loadStats();
  }

  if (checkingAuth) return null;

  const dueCount = dueIdeas().length;

  return (
    <div className="shell">
      <div className="masthead">
        <div className="brand">
          <span className="brand-mark">Afterword</span>
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

      {subscription && !subscription.entitled && (
        <div className="trial-banner trial-banner-locked">
          Your trial has ended. You can still view and export your library, but Capture and Review need a subscription.
          <button className="btn" onClick={upgrade}>
            Subscribe
          </button>
        </div>
      )}
      {subscription?.status === 'trialing' && subscription.entitled && trialDaysLeft !== null && (
        <div className="trial-banner">
          {(trialDaysLeft === 0 ? 'Your trial ends today.' : `${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} left in your trial.`) +
            ` ${subscription.trial_words_used.toLocaleString()} / ${subscription.trial_word_limit.toLocaleString()} words used.`}
          <button className="btn-ghost" onClick={upgrade}>
            Subscribe now
          </button>
        </div>
      )}

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
        <button className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>
          STATS
        </button>
        <button className={tab === 'import' ? 'active' : ''} onClick={() => setTab('import')}>
          IMPORT
        </button>
      </nav>

      {tab === 'capture' && subscription && !subscription.entitled && (
        <section className="view active">
          <div className="empty">
            <div className="empty-mark">Capture is paused</div>
            <div className="empty-sub">Your trial has ended. Subscribe to keep adding new ideas.</div>
            <button className="btn" style={{ marginTop: 16 }} onClick={upgrade}>
              Subscribe
            </button>
          </div>
        </section>
      )}

      {tab === 'capture' && (!subscription || subscription.entitled) && (
        <section className="view active">
          {dataLoaded && entries.length === 0 && (
            <div className="onboarding-card">
              <div className="onboarding-title">Welcome to Afterword</div>
              <div className="onboarding-body">
                Paste something you read below, click "Extract ideas," and Afterword pulls out
                the key points worth remembering. Save them, and they'll come back to you
                later in the Review tab on a spaced schedule — so you actually remember them,
                instead of forgetting like most highlights do.
              </div>
              <button className="btn-ghost" onClick={fillSample}>
                Try it with a sample
              </button>
            </div>
          )}
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
            <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Paste text, or a YouTube video link…" />
            <div className="hint">Afterword reads this and pulls out the ideas worth remembering. You can also paste a YouTube video link instead of text.</div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" onClick={extractIdeas} disabled={status.kind === 'loading'}>
              Extract ideas →
            </button>
            <button className="btn" onClick={summarizeContent} disabled={summarizing}>
              {summarizing ? 'Summarizing…' : 'Summarize'}
            </button>
            <button className="btn-ghost" onClick={startQuiz} disabled={quizzing}>
              {quizzing ? 'Writing quiz…' : 'Quiz me'}
            </button>
          </div>
          {status.kind !== 'idle' && (
            <div className="extract-status">
              {status.kind === 'loading' ? 'Reading it over…' : `Couldn't auto-extract (${status.msg}). Add ideas below.`}
            </div>
          )}

          {quiz && (
            <div className="review-stage" style={{ marginTop: 22 }}>
              {quizIdx >= quiz.length ? (
                <>
                  <div className="review-eyebrow">Quiz complete</div>
                  <div className="review-prompt">
                    You got {quizScore} / {quiz.length} right.
                  </div>
                  <button className="btn-ghost" style={{ marginTop: 14 }} onClick={closeQuiz}>
                    Close quiz
                  </button>
                </>
              ) : (
                (() => {
                  const q = quiz[quizIdx];
                  return (
                    <>
                      <div className="review-progress">
                        Question {quizIdx + 1} / {quiz.length}
                      </div>
                      <div className="review-prompt">{q.question}</div>
                      <div className="rate-row" style={{ flexDirection: 'column' }}>
                        {q.options.map((opt, i) => {
                          let state: 'default' | 'correct' | 'wrong' | 'dim' = 'default';
                          if (quizSelected !== null) {
                            if (i === q.answerIndex) state = 'correct';
                            else if (i === quizSelected) state = 'wrong';
                            else state = 'dim';
                          }
                          return (
                            <button
                              key={i}
                              className="rate-btn quiz-option"
                              data-state={state}
                              style={{ width: '100%', textAlign: 'left' }}
                              onClick={() => selectQuizOption(i)}
                              disabled={quizSelected !== null}
                            >
                              <span className="rk">{opt}</span>
                            </button>
                          );
                        })}
                      </div>
                      {quizSelected !== null && (
                        <>
                          <div className="hint" style={{ marginTop: 12 }}>{q.explanation}</div>
                          <button className="btn" style={{ marginTop: 14 }} onClick={nextQuizQuestion}>
                            {quizIdx + 1 >= quiz.length ? 'See results' : 'Next question →'}
                          </button>
                        </>
                      )}
                    </>
                  );
                })()
              )}
            </div>
          )}

          {(drafts.length > 0 || summary) && (
            <div style={{ marginTop: 22 }}>
              {summary && (
                <div className="field">
                  <label>Summary</label>
                  <textarea value={summary} onChange={(e) => setSummary(e.target.value)} style={{ minHeight: 80 }} />
                </div>
              )}
              {drafts.length > 0 && (
                <>
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
                </>
              )}
              <div className="field" style={{ marginTop: 14 }}>
                <label>Tags (optional, comma separated)</label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="e.g. productivity, psychology"
                />
                <div className="hint">Suggested automatically — edit or clear as you like.</div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button className="btn" onClick={saveEntry}>
                  Save to library
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => {
                    setDrafts([]);
                    setSummary('');
                  }}
                >
                  Discard
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {tab === 'review' && subscription && !subscription.entitled && (
        <section className="view active">
          <div className="empty">
            <div className="empty-mark">Review is paused</div>
            <div className="empty-sub">Your trial has ended. Subscribe to keep reviewing.</div>
            <button className="btn" style={{ marginTop: 16 }} onClick={upgrade}>
              Subscribe
            </button>
          </div>
        </section>
      )}

      {tab === 'review' && (!subscription || subscription.entitled) && (
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
                    <div className="review-prompt">Try to recall what you saved from this.</div>
                    {!revealed ? (
                      <button className="btn reveal-btn" onClick={() => setRevealed(true)}>
                        Reveal
                      </button>
                    ) : (
                      <>
                        <div className="review-answer">{idea.text}</div>
                        <div className="rate-row">
                          {(
                            [
                              ['again', 'Forgot it'],
                              ['hard', 'Fuzzy'],
                              ['good', 'Remembered it'],
                              ['easy', 'Nailed it'],
                            ] as const
                          ).map(([g, label]) => (
                            <button key={g} className="rate-btn" data-r={g} onClick={() => rate(idea, g)}>
                              <span className="rk">{label}</span>
                            </button>
                          ))}
                        </div>
                        <div className="hint" style={{ marginTop: 10 }}>
                          Be honest — it decides when this comes back. Forgot it or Fuzzy brings it back sooner; Remembered it or Nailed it space it out further.
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
          {(() => {
            const activeEntry = openEntryId ? entries.find((e) => e.id === openEntryId) : null;

            if (activeEntry) {
              const entryIdeas = ideas.filter((i) => i.entry_id === activeEntry.id);
              return (
                <>
                  <button className="btn-ghost" style={{ marginBottom: 16 }} onClick={closeEntry}>
                    ← Back to Library
                  </button>
                  <div className="entry-group">
                    <div className="entry-head">
                      <div className="entry-meta">
                        {activeEntry.type.toUpperCase()} · {new Date(activeEntry.created_at).toLocaleDateString()}
                        <button className="entry-delete" title="Delete file" onClick={() => deleteEntry(activeEntry)}>
                          Delete file
                        </button>
                      </div>
                    </div>
                    {activeEntry.summary && (
                      <div className="summary-box">
                        <div className="summary-label">Summary</div>
                        {activeEntry.summary}
                      </div>
                    )}
                    <div className="field">
                      <label>Title</label>
                      <input
                        type="text"
                        value={titleEditInput}
                        onChange={(e) => setTitleEditInput(e.target.value)}
                      />
                    </div>
                    <div className="field" style={{ marginBottom: 16 }}>
                      <label>Tags</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          type="text"
                          value={tagsEditInput}
                          onChange={(e) => setTagsEditInput(e.target.value)}
                          placeholder="e.g. productivity, psychology"
                          style={{ flex: 1 }}
                        />
                        <button className="btn-ghost" onClick={() => saveEntryMeta(activeEntry)}>
                          Save changes
                        </button>
                      </div>
                    </div>
                    {(entryIdeas.length > 0 || activeEntry.summary) && (
                      <div className="library-toolbar">
                        <button className="btn-ghost" onClick={() => exportEntry(activeEntry)}>
                          {selected.size > 0 ? `Export selected (${selected.size})` : 'Export this file'}
                        </button>
                        {selected.size > 0 && (
                          <button className="btn-ghost" onClick={() => setSelected(new Set())}>
                            Clear
                          </button>
                        )}
                      </div>
                    )}
                    {entryIdeas.length === 0 ? (
                      activeEntry.summary ? null : (
                        <div className="empty">
                          <div className="empty-mark">This file is empty</div>
                          <div className="empty-sub">Every idea in it has been deleted.</div>
                        </div>
                      )
                    ) : (
                      entryIdeas.map((idea) => {
                        const overdue = new Date(idea.due_date) <= new Date();
                        return (
                          <div className={`card ${selected.has(idea.id) ? 'card-selected' : ''}`} key={idea.id}>
                            <div className="card-row">
                              <input
                                type="checkbox"
                                className="card-check"
                                checked={selected.has(idea.id)}
                                onChange={() => toggleSelect(idea.id)}
                              />
                              <div className="card-text">{idea.text}</div>
                              <button className="remove" title="Delete idea" onClick={() => deleteIdea(idea)}>
                                ×
                              </button>
                            </div>
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
                      })
                    )}
                  </div>
                </>
              );
            }

            const allTags = Array.from(new Set(entries.flatMap((e) => e.tags || []))).sort();

            return (
              <>
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
                      Export all
                    </button>
                  </div>
                )}
                {allTags.length > 0 && (
                  <div className="tag-chip-row">
                    {allTags.map((t) => (
                      <button
                        key={t}
                        className={`tag-chip ${activeTag === t ? 'tag-chip-active' : ''}`}
                        onClick={() => setActiveTag(activeTag === t ? null : t)}
                      >
                        {t}
                      </button>
                    ))}
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
                    const visibleEntries = entries.filter((entry) => {
                      const entryIdeas = ideas.filter((i) => i.entry_id === entry.id);
                      if (entryIdeas.length === 0 && !entry.summary) return false;
                      if (activeTag && !(entry.tags || []).includes(activeTag)) return false;
                      return (
                        !query ||
                        entry.title.toLowerCase().includes(query) ||
                        (entry.tags || []).some((t) => t.toLowerCase().includes(query)) ||
                        entryIdeas.some((i) => i.text.toLowerCase().includes(query))
                      );
                    });
                    if (visibleEntries.length === 0) {
                      return (
                        <div className="empty">
                          <div className="empty-mark">No matches</div>
                          <div className="empty-sub">Try a different search term.</div>
                        </div>
                      );
                    }
                    return visibleEntries.map((entry) => {
                      const entryIdeas = ideas.filter((i) => i.entry_id === entry.id);
                      const dueCount = entryIdeas.filter((i) => new Date(i.due_date) <= new Date()).length;
                      return (
                        <div className="file-row" key={entry.id} onClick={() => openEntry(entry.id)}>
                          <div className="file-info">
                            <div className="entry-title">{entry.title}</div>
                            <div className="entry-meta">
                              {entry.type.toUpperCase()} · {new Date(entry.created_at).toLocaleDateString()} ·{' '}
                              {entryIdeas.length} idea{entryIdeas.length === 1 ? '' : 's'}
                              {dueCount > 0 && <span className="tab-badge">{dueCount}</span>}
                            </div>
                            {entry.tags && entry.tags.length > 0 && (
                              <div className="tag-chip-row" style={{ marginTop: 6 }}>
                                {entry.tags.map((t) => (
                                  <span key={t} className="tag-chip tag-chip-static">
                                    {t}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <button
                            className="entry-delete"
                            title="Delete file"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteEntry(entry);
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      );
                    });
                  })()
                )}
              </>
            );
          })()}
        </section>
      )}

      {tab === 'stats' && (
        <section className="view active">
          {!stats ? null : (
            <>
              <div className="streak-hero">
                <div className="streak-number">{stats.streak}</div>
                <div className="streak-label">
                  {stats.streak === 0
                    ? 'No streak yet — review something today to start one.'
                    : `day${stats.streak === 1 ? '' : 's'} in a row. Keep it going.`}
                </div>
              </div>

              <div className="stat-tiles">
                <div className="stat-tile">
                  <div className="stat-tile-value">{stats.reviewedThisWeek}</div>
                  <div className="stat-tile-label">Reviewed this week</div>
                </div>
                <div className="stat-tile">
                  <div className="stat-tile-value">{stats.totalReviews}</div>
                  <div className="stat-tile-label">Total reviews</div>
                </div>
              </div>

              <div className="field" style={{ marginTop: 8 }}>
                <label>Last 12 weeks</label>
                <div className="activity-grid">
                  {stats.grid.map((day) => {
                    const level = day.count === 0 ? 0 : day.count === 1 ? 1 : day.count === 2 ? 2 : 3;
                    return (
                      <div
                        key={day.date}
                        className={`activity-cell activity-l${level}`}
                        title={`${day.date}: ${day.count} review${day.count === 1 ? '' : 's'}`}
                      />
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {tab === 'import' && subscription && !subscription.entitled && (
        <section className="view active">
          <div className="empty">
            <div className="empty-mark">Import is paused</div>
            <div className="empty-sub">Your trial has ended. Subscribe to import highlights.</div>
            <button className="btn" style={{ marginTop: 16 }} onClick={upgrade}>
              Subscribe
            </button>
          </div>
        </section>
      )}

      {tab === 'import' && (!subscription || subscription.entitled) && (
        <section className="view active">
          <div className="row">
            <div className="field">
              <label>Source</label>
              <select value={importFormat} onChange={(e) => setImportFormat(e.target.value as 'kindle' | 'readwise')}>
                <option value="kindle">Kindle (My Clippings.txt)</option>
                <option value="readwise">Readwise (CSV export)</option>
              </select>
            </div>
            <div className="field">
              <label>File</label>
              <input
                type="file"
                accept={importFormat === 'kindle' ? '.txt' : '.csv'}
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>
          <div className="hint">
            {importFormat === 'kindle'
              ? 'Find "My Clippings.txt" on your Kindle when connected via USB (it\'s in the root "documents" folder).'
              : 'From Readwise: Settings → Export → Export all highlights as CSV.'}
            {' '}Each book becomes its own file in your Library, and each highlight becomes a saved idea.
          </div>
          <button className="btn" style={{ marginTop: 14 }} onClick={runImport} disabled={importStatus.kind === 'loading'}>
            {importStatus.kind === 'loading' ? 'Importing…' : 'Import'}
          </button>
          {importStatus.kind === 'error' && (
            <div className="extract-status">Import failed: {importStatus.msg}</div>
          )}
          {importStatus.kind === 'done' && <div className="extract-status">{importStatus.msg}</div>}
        </section>
      )}
    </div>
  );
}
