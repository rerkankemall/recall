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
  const [tab, setTab] = useState<'capture' | 'review' | 'library' | 'stats' | 'import'>('capture');

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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);

  function openEntry(entryId: string) {
    setSelected(new Set());
    setOpenEntryId(entryId);
  }

  function closeEntry() {
    setSelected(new Set());
    setOpenEntryId(null);
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
      await loadSubscription();
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
    const lines: string[] = [`# Recall export`, `Exported ${new Date().toLocaleString()}`, ''];
    entries.forEach((entry) => {
      const entryIdeas = ideas.filter((i) => i.entry_id === entry.id);
      if (entryIdeas.length === 0) return;
      lines.push(`## ${entry.title} (${entry.type})`, '');
      entryIdeas.forEach((idea) => lines.push(`- ${idea.text}`));
      lines.push('');
    });
    downloadMarkdown(`recall-export-${new Date().toISOString().slice(0, 10)}.md`, lines);
  }

  function exportEntry(entry: Entry) {
    const onlySelected = selected.size > 0;
    const entryIdeas = ideas.filter((i) => i.entry_id === entry.id && (!onlySelected || selected.has(i.id)));
    const lines: string[] = [
      `# ${entry.title}`,
      `${entry.type} · ${new Date(entry.created_at).toLocaleDateString()}`,
      '',
    ];
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
                      <div className="entry-title">{activeEntry.title}</div>
                      <div className="entry-meta">
                        {activeEntry.type.toUpperCase()} · {new Date(activeEntry.created_at).toLocaleDateString()}
                        <button className="entry-delete" title="Delete file" onClick={() => deleteEntry(activeEntry)}>
                          Delete file
                        </button>
                      </div>
                    </div>
                    {entryIdeas.length > 0 && (
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
                      <div className="empty">
                        <div className="empty-mark">This file is empty</div>
                        <div className="empty-sub">Every idea in it has been deleted.</div>
                      </div>
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
                      if (entryIdeas.length === 0) return false;
                      return (
                        !query ||
                        entry.title.toLowerCase().includes(query) ||
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
