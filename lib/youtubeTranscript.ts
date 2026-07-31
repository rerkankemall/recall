const YOUTUBE_URL_RE = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)[\w-]+/i;

export function isYoutubeUrl(text: string): boolean {
  return YOUTUBE_URL_RE.test(text.trim());
}

// Fetches a YouTube video's transcript via Supadata (api.supadata.ai).
// Throws with a user-facing message on failure.
export async function fetchYoutubeTranscript(url: string): Promise<string> {
  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) {
    throw new Error('YouTube transcript fetching is not configured on this server.');
  }

  const res = await fetch(
    `https://api.supadata.ai/v1/transcript?url=${encodeURIComponent(url.trim())}&text=true`,
    { headers: { 'x-api-key': apiKey } }
  );

  if (res.status === 202) {
    throw new Error('This video is taking longer to transcribe than expected — try a shorter video, or paste the transcript text directly.');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message || `Could not fetch this video's transcript (${res.status}).`);
  }

  const data = await res.json();
  const content = typeof data.content === 'string' ? data.content.trim() : '';
  if (!content) {
    throw new Error("This video doesn't have a transcript available.");
  }

  return content;
}
