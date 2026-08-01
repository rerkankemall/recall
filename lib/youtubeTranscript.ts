const YOUTUBE_URL_RE = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)[\w-]+/i;

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_WAIT_MS = 35000;
const TIMEOUT_MESSAGE =
  "This video is taking longer to transcribe than expected — try a shorter video, or paste the transcript text directly.";

export function isYoutubeUrl(text: string): boolean {
  return YOUTUBE_URL_RE.test(text.trim());
}

function extractContent(data: any): string {
  const content = typeof data.content === 'string' ? data.content.trim() : '';
  if (!content) {
    throw new Error("This video doesn't have a transcript available.");
  }
  return content;
}

// Longer videos (Supadata docs: ~20+ min) don't transcribe in time to answer
// the initial request, so the API instead returns a jobId to poll. We poll
// api/v1/transcript/{jobId} until it's done or we run out of budget — kept
// under the request's own time budget (see maxDuration on the API routes).
async function pollTranscriptJob(jobId: string, apiKey: string): Promise<string> {
  const deadline = Date.now() + POLL_MAX_WAIT_MS;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const res = await fetch(`https://api.supadata.ai/v1/transcript/${jobId}`, {
      headers: { 'x-api-key': apiKey },
    });

    if (!res.ok) {
      throw new Error(`Could not check this video's transcript status (${res.status}).`);
    }

    const data = await res.json();
    if (data.status === 'completed') {
      return extractContent(data);
    }
    if (data.status === 'failed') {
      throw new Error(data.error || 'Could not transcribe this video.');
    }
    // status is "queued" or "active" — keep polling
  }

  throw new Error(TIMEOUT_MESSAGE);
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
    const body = await res.json().catch(() => null);
    const jobId = body?.jobId;
    if (!jobId) {
      throw new Error(TIMEOUT_MESSAGE);
    }
    return await pollTranscriptJob(jobId, apiKey);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message || `Could not fetch this video's transcript (${res.status}).`);
  }

  const data = await res.json();
  return extractContent(data);
}
