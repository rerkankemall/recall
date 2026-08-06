const YOUTUBE_ID_RE = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]+)/i;

function getYoutubeThumbnail(content: string): string | null {
  const match = content.trim().match(YOUTUBE_ID_RE);
  if (!match) return null;
  return `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`;
}

// Open Library's search is full-text, not a title match — searching "Good"
// or "Next" happily returns "The Good Earth" or "The fire next time" just
// because the word appears somewhere in the title. To avoid attaching a
// wrong book's cover to an entry, only accept the result if what we searched
// for actually contains the matched title (handles "Deep Work (Cal Newport)"
// matching "Deep Work"), not just any word overlap.
async function fetchBookCoverUrl(title: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(title)}&limit=1&fields=title,cover_i`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const doc = data?.docs?.[0];
    const coverId = doc?.cover_i;
    const matchedTitle = typeof doc?.title === 'string' ? doc.title.trim().toLowerCase() : '';
    if (!coverId || !matchedTitle) return null;
    if (!title.trim().toLowerCase().includes(matchedTitle)) return null;
    return `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`;
  } catch {
    return null;
  }
}

// Resolves a cover image for a saved entry: a YouTube video's own thumbnail
// (no API call needed, just a predictable URL), or a book cover looked up
// from Open Library (free, no API key). Null for articles/papers/notes, or
// when nothing was found — this is decoration, never worth blocking a save.
export async function resolveCoverUrl(content: string, type: string, title: string): Promise<string | null> {
  const youtubeThumb = getYoutubeThumbnail(content || '');
  if (youtubeThumb) return youtubeThumb;

  if (type === 'Book' && title && title.trim() && title.trim().toLowerCase() !== 'untitled') {
    return await fetchBookCoverUrl(title.trim());
  }

  return null;
}
