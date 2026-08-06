const YOUTUBE_ID_RE = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]+)/i;

function getYoutubeThumbnail(content: string): string | null {
  const match = content.trim().match(YOUTUBE_ID_RE);
  if (!match) return null;
  return `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`;
}

async function fetchBookCoverUrl(title: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(title)}&limit=1&fields=cover_i`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const coverId = data?.docs?.[0]?.cover_i;
    if (!coverId) return null;
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
